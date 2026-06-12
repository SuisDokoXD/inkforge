import type {
  ChapterOrigin,
  OriginTagGetInput,
  OriginTagListByOriginInput,
  OriginTagSetInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalBoolean,
  requiredEnum,
  requiredNonEmptyString,
} from "./core";

const CHAPTER_ORIGINS = [
  "ai-auto",
  "ai-assisted",
  "manual",
] as const satisfies readonly ChapterOrigin[];

export function parseOriginTagSetInput(value: unknown): OriginTagSetInput {
  const channel = "origin-tag:set";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    origin: requiredEnum(obj, "origin", channel, CHAPTER_ORIGINS),
  };
}

export function parseOriginTagGetInput(value: unknown): OriginTagGetInput {
  const channel = "origin-tag:get";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
  };
}

export function parseOriginTagListByOriginInput(
  value: unknown,
): OriginTagListByOriginInput {
  const channel = "origin-tag:list-by-origin";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    origin: requiredEnum(obj, "origin", channel, CHAPTER_ORIGINS),
    includeUntagged: optionalBoolean(obj, "includeUntagged", channel),
  };
}
