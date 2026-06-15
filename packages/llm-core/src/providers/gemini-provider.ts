import type { LLMProvider } from "../provider";
import type { LLMChunk, LLMMessage, LLMRequest } from "../types";

export interface GeminiProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags?: string[];
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider implements LLMProvider {
  readonly id: string;
  readonly label: string;
  readonly vendor = "gemini" as const;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly tags: string[];

  private readonly timeoutMs: number;

  constructor(config: GeminiProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.tags = config.tags ?? [];
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async *complete(req: LLMRequest): AsyncIterable<LLMChunk> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const model = req.model ?? this.defaultModel;
      const url = `${this.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
      const payload = this.buildPayload(req);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        yield {
          type: "error",
          vendor: this.vendor,
          error: `HTTP ${response.status}: ${text || response.statusText}`,
        };
        return;
      }

      yield* this.parseStream(response.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: "error", vendor: this.vendor, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPayload(req: LLMRequest): Record<string, unknown> {
    const systemText = this.resolveSystem(req);
    const contents = (req.messages as LLMMessage[])
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 2048,
      },
    };

    if (systemText.trim()) {
      body.systemInstruction = { role: "system", parts: [{ text: systemText }] };
    }

    return body;
  }

  private resolveSystem(req: LLMRequest): string {
    if (req.systemPrompt?.trim()) return req.systemPrompt;
    return (req.messages as LLMMessage[])
      .filter((m) => m.role === "system")
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join("\n");
  }

  private async *parseStream(body: ReadableStream<Uint8Array>): AsyncIterable<LLMChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let emittedDone = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
                finishReason?: string;
              }>;
            };
            const parts = parsed.candidates?.[0]?.content?.parts ?? [];
            for (const p of parts) {
              if (typeof p.text === "string" && p.text.length > 0) {
                yield { type: "delta", textDelta: p.text, vendor: this.vendor, raw: parsed };
              }
            }
            const finish = parsed.candidates?.[0]?.finishReason;
            if (finish && finish !== "FINISH_REASON_UNSPECIFIED" && !emittedDone) {
              emittedDone = true;
              yield { type: "done", vendor: this.vendor, finishReason: finish, raw: parsed };
            }
          } catch {
            // ignore malformed chunk; resync at next "\n\n"
          }
        }
      }
    }

    if (!emittedDone) {
      yield { type: "done", vendor: this.vendor };
    }
  }
}
