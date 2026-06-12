import type {
  LLMAnalyzeInput,
  LLMChatInput,
  LLMChatMessage,
  LLMQuickActionInput,
  LLMQuickActionKind,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalNumber,
  optionalString,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

const LLM_QUICK_ACTION_KINDS = [
  "polish",
  "critique",
  "continue",
  "inspire",
  "rephrase",
] as const satisfies readonly LLMQuickActionKind[];

const LLM_CHAT_ROLES = ["user", "assistant"] as const;

function parseOptionalGenerationFields(obj: UnknownRecord, channel: string) {
  return {
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
    temperature: optionalNumber(obj, "temperature", channel),
    maxTokens: optionalNumber(obj, "maxTokens", channel),
  };
}

function requiredChatMessages(obj: UnknownRecord, channel: string): LLMChatMessage[] {
  const value = obj.messages;
  if (!Array.isArray(value)) fail(channel, "messages", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `messages[${index}]`, "an object");
    }
    const message = item as UnknownRecord;
    return {
      role: requiredEnum(message, "role", channel, LLM_CHAT_ROLES),
      content: requiredString(message, "content", channel),
    };
  });
}

export function parseLLMAnalyzeInput(value: unknown): LLMAnalyzeInput {
  const channel = "llm:analyze";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    chapterText: requiredString(obj, "chapterText", channel),
    trigger: optionalString(obj, "trigger", channel),
    systemPrompt: optionalString(obj, "systemPrompt", channel),
    ...parseOptionalGenerationFields(obj, channel),
  };
}

export function parseLLMQuickActionInput(value: unknown): LLMQuickActionInput {
  const channel = "llm:quick";
  const obj = asObject(value, channel);
  return {
    kind: requiredEnum(obj, "kind", channel, LLM_QUICK_ACTION_KINDS),
    selectedText: optionalString(obj, "selectedText", channel),
    contextBefore: optionalString(obj, "contextBefore", channel),
    contextAfter: optionalString(obj, "contextAfter", channel),
    persona: optionalString(obj, "persona", channel),
    options: optionalNumber(obj, "options", channel),
    extraInstruction: optionalString(obj, "extraInstruction", channel),
    projectId: optionalString(obj, "projectId", channel),
    chapterId: optionalString(obj, "chapterId", channel),
    ...parseOptionalGenerationFields(obj, channel),
  };
}

export function parseLLMChatInput(value: unknown): LLMChatInput {
  const channel = "llm:chat";
  const obj = asObject(value, channel);
  return {
    messages: requiredChatMessages(obj, channel),
    systemPrompt: optionalString(obj, "systemPrompt", channel),
    projectId: optionalString(obj, "projectId", channel),
    chapterId: optionalString(obj, "chapterId", channel),
    chapterExcerpt: optionalString(obj, "chapterExcerpt", channel),
    ...parseOptionalGenerationFields(obj, channel),
  };
}
