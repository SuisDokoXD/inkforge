import type {
  WorldCreateInput,
  WorldDeleteInput,
  WorldEntryPosition,
  WorldEntrySelectiveLogic,
  WorldGetInput,
  WorldListInput,
  WorldSearchInput,
  WorldUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

const WORLD_ENTRY_POSITIONS = [
  "before",
  "after",
  "at_depth",
] as const satisfies readonly WorldEntryPosition[];

const WORLD_ENTRY_SELECTIVE_LOGICS = [
  "and_any",
  "not_all",
  "not_any",
  "and_all",
] as const satisfies readonly WorldEntrySelectiveLogic[];

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

function parseWorldOptionalFields(obj: UnknownRecord, channel: string) {
  return {
    content: optionalString(obj, "content", channel),
    aliases: optionalStringArray(obj, "aliases", channel),
    tags: optionalStringArray(obj, "tags", channel),
    keys: optionalStringArray(obj, "keys", channel),
    position: optionalEnum(obj, "position", channel, WORLD_ENTRY_POSITIONS),
    probability: optionalNumber(obj, "probability", channel),
    secondaryKeys: optionalStringArray(obj, "secondaryKeys", channel),
    selectiveLogic: optionalEnum(
      obj,
      "selectiveLogic",
      channel,
      WORLD_ENTRY_SELECTIVE_LOGICS,
    ),
    caseSensitive: optionalBoolean(obj, "caseSensitive", channel),
    constant: optionalBoolean(obj, "constant", channel),
    extensions: optionalUnknownRecord(obj, "extensions", channel),
  };
}

export function parseWorldListInput(value: unknown): WorldListInput {
  const channel = "world:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    category: optionalString(obj, "category", channel),
    search: optionalString(obj, "search", channel),
  };
}

export function parseWorldGetInput(value: unknown): WorldGetInput {
  const channel = "world:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldCreateInput(value: unknown): WorldCreateInput {
  const channel = "world:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    category: requiredString(obj, "category", channel),
    title: requiredString(obj, "title", channel),
    ...parseWorldOptionalFields(obj, channel),
  };
}

export function parseWorldUpdateInput(value: unknown): WorldUpdateInput {
  const channel = "world:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    category: optionalString(obj, "category", channel),
    title: optionalString(obj, "title", channel),
    ...parseWorldOptionalFields(obj, channel),
  };
}

export function parseWorldDeleteInput(value: unknown): WorldDeleteInput {
  const channel = "world:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldSearchInput(value: unknown): WorldSearchInput {
  const channel = "world:search";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    query: requiredString(obj, "query", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}
