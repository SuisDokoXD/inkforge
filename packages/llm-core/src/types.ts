export type LLMVendor = "anthropic" | "openai" | "gemini" | "openai-compat";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, string>;
}

export interface LLMChunk {
  type: "delta" | "done" | "error";
  textDelta?: string;
  vendor: LLMVendor;
  error?: string;
  finishReason?: string;
  raw?: unknown;
}
