import type { LLMProvider } from "../provider";
import type { LLMChunk, LLMMessage, LLMRequest, LLMVendor } from "../types";

export interface OpenAIProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags?: string[];
  /** Vendor tag to emit on chunks. Defaults to "openai". */
  vendor?: Extract<LLMVendor, "openai" | "openai-compat">;
  /** Extra headers merged into every request. */
  extraHeaders?: Record<string, string>;
  /** Milliseconds before the upstream fetch aborts. Defaults to 60000. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAIProvider implements LLMProvider {
  readonly id: string;
  readonly label: string;
  readonly vendor: Extract<LLMVendor, "openai" | "openai-compat">;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly tags: string[];

  private readonly extraHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: OpenAIProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.vendor = config.vendor ?? "openai";
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.tags = config.tags ?? [];
    this.extraHeaders = config.extraHeaders ?? {};
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async *complete(req: LLMRequest): AsyncIterable<LLMChunk> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = this.buildPayload(req);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.extraHeaders,
      };
      if (this.apiKey.trim()) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
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

      yield* this.parseSSE(response.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: "error", vendor: this.vendor, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  protected buildPayload(req: LLMRequest): Record<string, unknown> {
    const messages = this.toOpenAIMessages(req);
    return {
      model: req.model ?? this.defaultModel,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
      stream: true,
    };
  }

  private toOpenAIMessages(req: LLMRequest): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const out: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (req.systemPrompt?.trim()) {
      out.push({ role: "system", content: req.systemPrompt });
    }
    for (const m of req.messages as LLMMessage[]) {
      out.push({ role: m.role, content: m.content });
    }
    return out;
  }

  private async *parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<LLMChunk> {
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
          if (payload === "[DONE]") {
            emittedDone = true;
            yield { type: "done", vendor: this.vendor };
            return;
          }
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              yield { type: "delta", textDelta: delta, vendor: this.vendor, raw: parsed };
            }
            const finish = parsed.choices?.[0]?.finish_reason;
            if (finish && !emittedDone) {
              emittedDone = true;
              yield { type: "done", vendor: this.vendor, finishReason: finish, raw: parsed };
            }
          } catch {
            // ignore malformed JSON fragment; will resync at next "\n\n"
          }
        }
      }
    }

    if (!emittedDone) {
      yield { type: "done", vendor: this.vendor };
    }
  }
}
