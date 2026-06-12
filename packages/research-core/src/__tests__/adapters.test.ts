import { describe, expect, it, vi } from "vitest";
import type { ResearchSearchHit } from "@inkforge/shared";
import { createBingAdapter } from "../bing-adapter";
import { createLlmFallbackAdapter } from "../llm-fallback-adapter";
import { createSerpapiAdapter } from "../serpapi-adapter";
import { createTavilyAdapter } from "../tavily-adapter";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => init.text ?? JSON.stringify(body),
  } as Response;
}

describe("Tavily adapter", () => {
  it("requires an API key before making a request", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const adapter = createTavilyAdapter({ fetchFn });

    await expect(adapter.search({ query: "worldbuilding" })).rejects.toMatchObject({
      code: "missing_api_key",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts a clamped search request and maps valid results", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        results: [
          { title: "A", url: "https://a.example", content: "  hit A  ", score: 0.8 },
          { title: "Ignored", content: "ignored" },
        ],
      }),
    ) as unknown as typeof fetch;
    const adapter = createTavilyAdapter({ fetchFn });

    const hits = await adapter.search({
      query: "龙与城市",
      topK: 99,
      apiKey: "secret",
      timeoutMs: 1000,
    });

    expect(hits).toEqual([
      {
        title: "A",
        url: "https://a.example",
        snippet: "hit A",
        provider: "tavily",
        score: 0.8,
      },
    ]);

    const [url, init] = (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer secret",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: "龙与城市",
      max_results: 10,
      search_depth: "basic",
      include_answer: false,
    });
  });
});

describe("SerpAPI adapter", () => {
  it("builds Google search params and maps result positions to scores", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        organic_results: [
          { title: "First", link: "https://first.example", snippet: "  one  ", position: 2 },
          { title: "No link", snippet: "ignored", position: 3 },
        ],
      }),
    ) as unknown as typeof fetch;
    const adapter = createSerpapiAdapter({ fetchFn });

    const hits = await adapter.search({
      query: "setting details",
      topK: 0,
      apiKey: "serp-secret",
      timeoutMs: 1000,
    });

    expect(hits).toEqual([
      {
        title: "First",
        url: "https://first.example",
        snippet: "one",
        provider: "serpapi",
        score: 0.5,
      },
    ]);

    const requested = new URL(
      (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0][0],
    );
    expect(requested.origin + requested.pathname).toBe("https://serpapi.com/search.json");
    expect(requested.searchParams.get("engine")).toBe("google");
    expect(requested.searchParams.get("q")).toBe("setting details");
    expect(requested.searchParams.get("num")).toBe("1");
    expect(requested.searchParams.get("api_key")).toBe("serp-secret");
  });
});

describe("Bing adapter", () => {
  it("uses the subscription header and wraps HTTP failures", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "quota" }, { ok: false, status: 429, text: "quota exceeded" }),
    ) as unknown as typeof fetch;
    const adapter = createBingAdapter({ fetchFn });

    await expect(
      adapter.search({ query: "history", topK: 50, apiKey: "bing-key", timeoutMs: 1000 }),
    ).rejects.toMatchObject({
      code: "bing_http_error",
      message: expect.stringContaining("429"),
    });

    const [url, init] = (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0];
    const requested = new URL(url);
    expect(requested.searchParams.get("count")).toBe("20");
    expect(requested.searchParams.get("safeSearch")).toBe("Moderate");
    expect(init.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "bing-key",
    });
  });
});

describe("LLM fallback adapter", () => {
  it("clamps requested result count and marks all hits as non-realtime fallback results", async () => {
    const summarize = vi.fn(async (): Promise<ResearchSearchHit[]> => [
      {
        title: "Overview",
        url: "inkforge://llm-fallback",
        snippet: "summary",
        provider: "manual",
      },
    ]);
    const adapter = createLlmFallbackAdapter(summarize);

    const hits = await adapter.search({ query: "topic", topK: 99 });

    expect(summarize).toHaveBeenCalledWith({ query: "topic", topK: 5 });
    expect(hits).toEqual([
      {
        title: "Overview",
        url: "inkforge://llm-fallback",
        snippet: "summary",
        provider: "llm-fallback",
      },
    ]);
  });

  it("wraps summarizer failures with a research error code", async () => {
    const adapter = createLlmFallbackAdapter(async () => {
      throw new Error("model unavailable");
    });

    await expect(adapter.search({ query: "topic" })).rejects.toMatchObject({
      code: "llm_fallback_failed",
      message: "model unavailable",
    });
  });
});
