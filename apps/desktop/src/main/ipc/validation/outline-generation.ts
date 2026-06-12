import type {
  ChapterCommitDraftInput,
  ChapterGenerateFromOutlineInput,
  OutlineGenerateChaptersInput,
  OutlineGenerateMasterInput,
  OutlineRefineInput,
  OutlineRefineTarget,
  OutlineUndoRefineInput,
  ProjectUpdateMetaInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

const OUTLINE_REFINE_TARGET_KINDS = ["master", "card"] as const;
const CHAPTER_CANDIDATE_COUNTS = [1, 2, 3] as const;

function optionalCandidateCount(
  obj: UnknownRecord,
  key: string,
  channel: string,
): 1 | 2 | 3 | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (value !== 1 && value !== 2 && value !== 3) {
    fail(channel, key, "1, 2, or 3");
  }
  return value;
}

function parseOptionalCreativeMeta(obj: UnknownRecord, channel: string) {
  return {
    synopsis: optionalString(obj, "synopsis", channel),
    genre: optionalString(obj, "genre", channel),
    subGenre: optionalString(obj, "subGenre", channel),
    tags: optionalStringArray(obj, "tags", channel),
    globalWorldview: optionalString(obj, "globalWorldview", channel),
  };
}

function parseOptionalProvider(obj: UnknownRecord, channel: string) {
  return {
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
  };
}

function requiredOutlineRefineTarget(
  obj: UnknownRecord,
  channel: string,
): OutlineRefineTarget {
  const value = obj.target;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, "target", "an object");
  }
  const target = value as UnknownRecord;
  const kind = requiredEnum(target, "kind", channel, OUTLINE_REFINE_TARGET_KINDS);
  if (kind === "master") {
    return {
      kind,
      projectId: requiredNonEmptyString(target, "projectId", channel),
    };
  }
  return {
    kind,
    cardId: requiredNonEmptyString(target, "cardId", channel),
  };
}

export function parseProjectUpdateMetaInput(value: unknown): ProjectUpdateMetaInput {
  const channel = "project:update-meta";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    ...parseOptionalCreativeMeta(obj, channel),
  };
}

export function parseOutlineGenerateMasterInput(
  value: unknown,
): OutlineGenerateMasterInput {
  const channel = "outline:generate-master";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    ...parseOptionalCreativeMeta(obj, channel),
    ...parseOptionalProvider(obj, channel),
  };
}

export function parseOutlineGenerateChaptersInput(
  value: unknown,
): OutlineGenerateChaptersInput {
  const channel = "outline:generate-chapters";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    targetCount: optionalNumber(obj, "targetCount", channel),
    replaceExisting: optionalBoolean(obj, "replaceExisting", channel),
    ...parseOptionalProvider(obj, channel),
  };
}

export function parseOutlineRefineInput(value: unknown): OutlineRefineInput {
  const channel = "outline:refine";
  const obj = asObject(value, channel);
  return {
    target: requiredOutlineRefineTarget(obj, channel),
    intent: requiredString(obj, "intent", channel),
    ...parseOptionalProvider(obj, channel),
  };
}

export function parseOutlineUndoRefineInput(value: unknown): OutlineUndoRefineInput {
  const channel = "outline:undo-refine";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseChapterGenerateFromOutlineInput(
  value: unknown,
): ChapterGenerateFromOutlineInput {
  const channel = "chapter:generate-from-outline";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    outlineCardId: requiredNonEmptyString(obj, "outlineCardId", channel),
    candidates: optionalCandidateCount(obj, "candidates", channel),
    prevChapterId: optionalString(obj, "prevChapterId", channel),
    sampleLibIds: optionalStringArray(obj, "sampleLibIds", channel),
    maxTokens: optionalNumber(obj, "maxTokens", channel),
    ...parseOptionalProvider(obj, channel),
  };
}

export function parseChapterCommitDraftInput(value: unknown): ChapterCommitDraftInput {
  const channel = "chapter:commit-draft";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    text: requiredString(obj, "text", channel),
    title: requiredString(obj, "title", channel),
    chapterId: optionalString(obj, "chapterId", channel),
    outlineCardId: optionalString(obj, "outlineCardId", channel),
  };
}
