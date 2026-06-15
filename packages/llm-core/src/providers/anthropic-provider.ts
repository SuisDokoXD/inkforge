import * as crypto from "crypto";
import type { LLMProvider } from "../provider";
import type { LLMChunk, LLMMessage, LLMRequest } from "../types";

type AnthropicModule = {
  default: new (config: {
    apiKey: string;
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
  }) => {
    messages: {
      create(payload: Record<string, unknown>): Promise<AsyncIterable<Record<string, unknown>>>;
    };
  };
};

export interface AnthropicProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags?: string[];
  /** Anthropic beta flags to send via the `anthropic-beta` header. */
  betaHeaders?: string[];
  /**
   * When true, shape the request to match Claude Code CLI so AnyRouter-style
   * proxies (anyrouter.top, new-api) accept it. The caller's system prompt is
   * merged into the first user message because the `system` slot is used for
   * proxy verification. Defaults to true.
   */
  claudeCodeCompat?: boolean;
}

const CLAUDE_CODE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

const DEFAULT_BETA_HEADERS = [
  "claude-code-20250219",
  "context-1m-2025-08-07",
  "interleaved-thinking-2025-05-14",
  "redact-thinking-2026-02-12",
  "context-management-2025-06-27",
  "prompt-caching-scope-2026-01-05",
  "advanced-tool-use-2025-11-20",
  "effort-2025-11-24",
  "fast-mode-2026-02-01",
];

function generateClaudeCodeUserId(): string {
  const deviceId = crypto.randomBytes(32).toString("hex");
  const sessionId = crypto.randomUUID();
  return JSON.stringify({
    device_id: deviceId,
    account_uuid: "",
    session_id: sessionId,
  });
}

export class AnthropicProvider implements LLMProvider {
  readonly id: string;
  readonly label: string;
  readonly vendor = "anthropic" as const;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly tags: string[];

  private readonly claudeCodeCompat: boolean;
  private readonly clientPromise: Promise<{
    messages: {
      create(payload: Record<string, unknown>): Promise<AsyncIterable<Record<string, unknown>>>;
    };
  }>;

  constructor(config: AnthropicProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.tags = config.tags ?? [];
    this.claudeCodeCompat = config.claudeCodeCompat ?? true;

    this.clientPromise = import("@anthropic-ai/sdk").then((module) => {
      const anthropicModule = module as unknown as AnthropicModule;
      const betas = config.betaHeaders ?? DEFAULT_BETA_HEADERS;
      const defaultHeaders: Record<string, string> = {};
      if (betas.length > 0) {
        defaultHeaders["anthropic-beta"] = betas.join(",");
      }
      if (this.claudeCodeCompat) {
        defaultHeaders["anthropic-version"] = "2023-06-01";
        defaultHeaders["x-app"] = "cli";
        defaultHeaders["User-Agent"] = "claude-cli/2.1.92 (external, cli)";
      }
      const client = new anthropicModule.default({
        apiKey: this.apiKey,
        baseURL: this.baseUrl || undefined,
        defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
      });
      return client;
    });
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async *complete(req: LLMRequest): AsyncIterable<LLMChunk> {
    try {
      const client = await this.clientPromise;
      const payload = this.buildPayload(req);
      const stream = await client.messages.create(payload);

      let emittedDone = false;
      let finishReason: string | undefined;
      for await (const event of stream) {
        const eventType = typeof event.type === "string" ? event.type : "";

        if (eventType === "content_block_delta") {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            yield {
              type: "delta",
              textDelta: delta.text,
              vendor: this.vendor,
              raw: event,
            };
          }
        }

        if (eventType === "message_delta") {
          const delta = event.delta as { stop_reason?: string | null } | undefined;
          if (typeof delta?.stop_reason === "string") {
            finishReason = delta.stop_reason;
          }
        }

        if (eventType === "message_stop") {
          emittedDone = true;
          yield {
            type: "done",
            vendor: this.vendor,
            finishReason,
            raw: event,
          };
        }
      }

      if (!emittedDone) {
        yield {
          type: "done",
          vendor: this.vendor,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield {
        type: "error",
        vendor: this.vendor,
        error: message,
      };
    }
  }

  private buildPayload(req: LLMRequest): Record<string, unknown> {
    const model = req.model ?? this.defaultModel;
    const maxTokens = req.maxTokens ?? 2048;
    const baseMessages = this.toAnthropicMessages(req.messages);
    const actualSystem = this.resolveSystemPrompt(req);

    if (this.claudeCodeCompat) {
      const messages = this.mergeSystemIntoMessages(actualSystem, baseMessages);
      return {
        model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: CLAUDE_CODE_SYSTEM }],
        messages,
        metadata: { user_id: generateClaudeCodeUserId() },
        thinking: { type: "adaptive" },
        stream: true,
      };
    }

    return {
      model,
      max_tokens: maxTokens,
      temperature: req.temperature ?? 0.7,
      system: actualSystem || undefined,
      messages: baseMessages,
      stream: true,
    };
  }

  private mergeSystemIntoMessages(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    if (!systemPrompt.trim()) return messages;
    if (messages.length === 0) {
      return [{ role: "user", content: systemPrompt }];
    }
    const [first, ...rest] = messages;
    if (first.role === "user") {
      return [{ role: "user", content: `${systemPrompt}\n\n${first.content}` }, ...rest];
    }
    return [{ role: "user", content: systemPrompt }, ...messages];
  }

  private toAnthropicMessages(messages: LLMMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));
  }

  private resolveSystemPrompt(req: LLMRequest): string {
    if (req.systemPrompt?.trim()) {
      return req.systemPrompt;
    }

    const systemMessages = req.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter((message) => message.length > 0);

    return systemMessages.join("\n");
  }
}
