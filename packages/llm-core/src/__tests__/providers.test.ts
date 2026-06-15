import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider } from "../registry";
import type { LLMChunk } from "../types";
import { GeminiProvider } from "../providers/gemini-provider";
import { OpenAIProvider } from "../providers/openai-provider";
import { OpenAICompatProvider } from "../providers/openai-compat-provider";

async function collect(stream: AsyncIterable<LLMChunk>): Promise<LLMChunk[]> {
  const chunks: LLMChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function streamFromText(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

function streamResponse(...parts: string[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: streamFromText(...parts),
    text: async () => "",
  } as Response;
}

describe("provider registry", () => {
  it("creates OpenAI-compatible providers and normalizes metadata", () => {
    const provider = createProvider({
      id: "compat",
      label: "Compat",
      vendor: "openai-compat",
      baseUrl: "https://compat.example/v1///",
      apiKey: "secret",
      defaultModel: "model-a",
      tags: ["fast"],
      options: { timeoutMs: 1000 },
    });

    expect(provider).toBeInstanceOf(OpenAICompatProvider);
    expect(provider.vendor).toBe("openai-compat");
    expect(provider.baseUrl).toBe("https://compat.example/v1");
    expect(provider.tags).toEqual(["fast"]);
  });

  it("rejects unsupported provider vendors", () => {
    expect(() =>
      createProvider({
        id: "bad",
        label: "Bad",
        vendor: "ollama" as never,
        baseUrl: "",
        apiKey: "",
        defaultModel: "x",
      }),
    ).toThrow("Unknown provider vendor");
  });
});

describe("OpenAIProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds chat completion requests and parses SSE deltas", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider({
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.example/v1/",
      apiKey: "secret",
      defaultModel: "gpt-default",
      extraHeaders: { "X-Test": "1" },
      timeoutMs: 1000,
    });

    const chunks = await collect(
      provider.complete({
        model: "gpt-test",
        systemPrompt: "system rules",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        maxTokens: 64,
      }),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(["delta", "delta", "done"]);
    expect(chunks.map((chunk) => chunk.textDelta).filter(Boolean)).toEqual(["Hel", "lo"]);
    expect(chunks.at(-1)?.finishReason).toBe("stop");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
      "X-Test": "1",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-test",
      messages: [
        { role: "system", content: "system rules" },
        { role: "user", content: "hello" },
      ],
      temperature: 0.2,
      max_tokens: 64,
      stream: true,
    });
  });

  it("preserves finishReason when [DONE] arrives after finish_reason", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        'data: {"choices":[{"delta":{"content":"First"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Last"},"finish_reason":"length"}]}\n\n',
        "data: [DONE]\n\n",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider({
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      defaultModel: "gpt-default",
      timeoutMs: 1000,
    });

    const chunks = await collect(
      provider.complete({
        messages: [{ role: "user", content: "write" }],
        maxTokens: 256,
      }),
    );

    expect(chunks.at(-1)?.finishReason).toBe("length");
  });

  it("marks chunks from OpenAI-compatible providers with the compatible vendor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"),
      ),
    );

    const provider = new OpenAICompatProvider({
      id: "compat",
      label: "Compat",
      baseUrl: "https://compat.example",
      apiKey: "",
      defaultModel: "compat-model",
      timeoutMs: 1000,
    });

    expect((await collect(provider.complete({ messages: [{ role: "user", content: "Hi" }] }))).map(
      (chunk) => chunk.vendor,
    )).toEqual(["openai-compat", "openai-compat"]);
  });
});

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps messages to Gemini contents and parses streamed candidates", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        'data: {"candidates":[{"content":{"parts":[{"text":"A"},{"text":"B"}]},"finishReason":"STOP"}]}\n\n',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      id: "gemini",
      label: "Gemini",
      baseUrl: "https://gemini.example/v1beta/",
      apiKey: "g-key",
      defaultModel: "gemini/default",
      timeoutMs: 1000,
    });

    const chunks = await collect(
      provider.complete({
        systemPrompt: "system text",
        messages: [
          { role: "system", content: "ignored because systemPrompt wins" },
          { role: "user", content: "question" },
          { role: "assistant", content: "answer" },
        ],
        maxTokens: 32,
      }),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(["delta", "delta", "done"]);
    expect(chunks.map((chunk) => chunk.textDelta).filter(Boolean)).toEqual(["A", "B"]);
    expect(chunks.at(-1)?.finishReason).toBe("STOP");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://gemini.example/v1beta/models/gemini%2Fdefault:streamGenerateContent?alt=sse&key=g-key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      contents: [
        { role: "user", parts: [{ text: "question" }] },
        { role: "model", parts: [{ text: "answer" }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 32,
      },
      systemInstruction: {
        role: "system",
        parts: [{ text: "system text" }],
      },
    });
  });
});
