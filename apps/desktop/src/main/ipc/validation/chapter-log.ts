import type {
  ChapterLogAppendAiInput,
  ChapterLogAppendManualInput,
  ChapterLogDeleteInput,
  ChapterLogEntryKind,
  ChapterLogListInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalNumber,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

const CHAPTER_LOG_AI_KINDS = ["ai-run", "progress"] as const satisfies readonly Extract<
  ChapterLogEntryKind,
  "ai-run" | "progress"
>[];

function optionalUnknownRecord(
  obj: UnknownRecord,
  key: string,
  channel: string,
): Record<string, unknown> | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, key, "an object");
  }
  return value as Record<string, unknown>;
}

export function parseChapterLogListInput(value: unknown): ChapterLogListInput {
  const channel = "chapter-log:list";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    limit: optionalNumber(obj, "limit", channel),
    desc: optionalBoolean(obj, "desc", channel),
  };
}

export function parseChapterLogAppendManualInput(
  value: unknown,
): ChapterLogAppendManualInput {
  const channel = "chapter-log:append-manual";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    content: requiredString(obj, "content", channel),
  };
}

export function parseChapterLogAppendAiInput(value: unknown): ChapterLogAppendAiInput {
  const channel = "chapter-log:append-ai";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    kind: requiredEnum(obj, "kind", channel, CHAPTER_LOG_AI_KINDS),
    content: requiredString(obj, "content", channel),
    metadata: optionalUnknownRecord(obj, "metadata", channel),
  };
}

export function parseChapterLogDeleteInput(value: unknown): ChapterLogDeleteInput {
  const channel = "chapter-log:delete";
  const obj = asObject(value, channel);
  return {
    entryId: requiredNonEmptyString(obj, "entryId", channel),
  };
}
