import type {
  WorldEntryPosition,
  WorldEntrySelectiveLogic,
  WorldPackCoverReadInput,
  WorldPackCoverWriteInput,
  WorldPackCreateInput,
  WorldPackDeleteInput,
  WorldPackEntryCreateInput,
  WorldPackEntryDeleteInput,
  WorldPackEntryListInput,
  WorldPackEntryUpdateInput,
  WorldPackFuseInput,
  WorldPackGetInput,
  WorldPackListInput,
  WorldPackOrigin,
  WorldPackSlotAddInput,
  WorldPackSlotListInput,
  WorldPackSlotRemoveInput,
  WorldPackSlotReorderInput,
  WorldPackSlotToggleInput,
  WorldPackUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredBoolean,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  requiredStringArray,
  type UnknownRecord,
} from "./core";

const WORLD_PACK_ORIGINS = ["user", "fused", "imported"] as const satisfies readonly WorldPackOrigin[];
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

function requiredBinary(
  obj: UnknownRecord,
  key: string,
  channel: string,
): ArrayBuffer | Uint8Array {
  const value = obj[key];
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    return value;
  }
  fail(channel, key, "an ArrayBuffer or Uint8Array");
}

function parsePackEditableFields(obj: UnknownRecord, channel: string) {
  return {
    tagline: optionalString(obj, "tagline", channel),
    description: optionalString(obj, "description", channel),
    tags: optionalStringArray(obj, "tags", channel),
    scanDepth: optionalNumber(obj, "scanDepth", channel),
    tokenBudget: optionalNumber(obj, "tokenBudget", channel),
    recursionEnabled: optionalBoolean(obj, "recursionEnabled", channel),
  };
}

function parseEntryEditableFields(obj: UnknownRecord, channel: string) {
  return {
    content: optionalString(obj, "content", channel),
    aliases: optionalStringArray(obj, "aliases", channel),
    tags: optionalStringArray(obj, "tags", channel),
    keys: optionalStringArray(obj, "keys", channel),
    position: optionalEnum(obj, "position", channel, WORLD_ENTRY_POSITIONS),
    probability: optionalNumber(obj, "probability", channel),
    order: optionalNumber(obj, "order", channel),
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

function requiredNestedString(
  obj: UnknownRecord,
  key: string,
  channel: string,
  fieldPath: string,
): string {
  const value = obj[key];
  if (typeof value !== "string") {
    fail(channel, fieldPath, "a string");
  }
  return value;
}

function requiredNestedStringArray(
  obj: UnknownRecord,
  key: string,
  channel: string,
  fieldPath: string,
): string[] {
  const value = obj[key];
  if (!Array.isArray(value)) {
    fail(channel, fieldPath, "an array of strings");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      fail(channel, `${fieldPath}[${index}]`, "a non-empty string");
    }
    return item;
  });
}

function optionalWorldPackFuseSuggestion(
  obj: UnknownRecord,
  key: string,
  channel: string,
): WorldPackFuseInput["suggestion"] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, key, "an object");
  }
  const suggestion = value as UnknownRecord;
  const entriesValue = suggestion.entries;
  if (!Array.isArray(entriesValue)) {
    fail(channel, `${key}.entries`, "an array");
  }
  return {
    name: requiredNestedString(suggestion, "name", channel, `${key}.name`),
    tagline: requiredNestedString(suggestion, "tagline", channel, `${key}.tagline`),
    description: requiredNestedString(
      suggestion,
      "description",
      channel,
      `${key}.description`,
    ),
    tags: requiredNestedStringArray(suggestion, "tags", channel, `${key}.tags`),
    entries: entriesValue.map((entryValue, index) => {
      if (!entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) {
        fail(channel, `${key}.entries[${index}]`, "an object");
      }
      const entry = entryValue as UnknownRecord;
      const entryPath = `${key}.entries[${index}]`;
      return {
        category: requiredNestedString(
          entry,
          "category",
          channel,
          `${entryPath}.category`,
        ),
        title: requiredNestedString(entry, "title", channel, `${entryPath}.title`),
        content: requiredNestedString(
          entry,
          "content",
          channel,
          `${entryPath}.content`,
        ),
        aliases: requiredNestedStringArray(
          entry,
          "aliases",
          channel,
          `${entryPath}.aliases`,
        ),
        keys: requiredNestedStringArray(entry, "keys", channel, `${entryPath}.keys`),
      };
    }),
  };
}

export function parseWorldPackListInput(value: unknown): WorldPackListInput {
  const channel = "world-pack:list";
  const obj = asObject(value, channel);
  return {
    search: optionalString(obj, "search", channel),
    origin: optionalEnum(obj, "origin", channel, WORLD_PACK_ORIGINS),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseWorldPackGetInput(value: unknown): WorldPackGetInput {
  const channel = "world-pack:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldPackCreateInput(value: unknown): WorldPackCreateInput {
  const channel = "world-pack:create";
  const obj = asObject(value, channel);
  return {
    name: requiredString(obj, "name", channel),
    ...parsePackEditableFields(obj, channel),
  };
}

export function parseWorldPackUpdateInput(value: unknown): WorldPackUpdateInput {
  const channel = "world-pack:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    name: optionalString(obj, "name", channel),
    coverPath: optionalNullableString(obj, "coverPath", channel),
    coverMime: optionalNullableString(obj, "coverMime", channel),
    ...parsePackEditableFields(obj, channel),
  };
}

export function parseWorldPackDeleteInput(value: unknown): WorldPackDeleteInput {
  const channel = "world-pack:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldPackEntryListInput(value: unknown): WorldPackEntryListInput {
  const channel = "world-pack:entry-list";
  const obj = asObject(value, channel);
  return {
    packId: requiredNonEmptyString(obj, "packId", channel),
  };
}

export function parseWorldPackEntryCreateInput(
  value: unknown,
): WorldPackEntryCreateInput {
  const channel = "world-pack:entry-create";
  const obj = asObject(value, channel);
  return {
    packId: requiredNonEmptyString(obj, "packId", channel),
    category: requiredString(obj, "category", channel),
    title: requiredString(obj, "title", channel),
    ...parseEntryEditableFields(obj, channel),
  };
}

export function parseWorldPackEntryUpdateInput(
  value: unknown,
): WorldPackEntryUpdateInput {
  const channel = "world-pack:entry-update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    category: optionalString(obj, "category", channel),
    title: optionalString(obj, "title", channel),
    ...parseEntryEditableFields(obj, channel),
  };
}

export function parseWorldPackEntryDeleteInput(
  value: unknown,
): WorldPackEntryDeleteInput {
  const channel = "world-pack:entry-delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldPackSlotListInput(value: unknown): WorldPackSlotListInput {
  const channel = "world-pack:slot-list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseWorldPackSlotAddInput(value: unknown): WorldPackSlotAddInput {
  const channel = "world-pack:slot-add";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    packId: requiredNonEmptyString(obj, "packId", channel),
    slotOrder: optionalNumber(obj, "slotOrder", channel),
    enabled: optionalBoolean(obj, "enabled", channel),
  };
}

export function parseWorldPackSlotRemoveInput(
  value: unknown,
): WorldPackSlotRemoveInput {
  const channel = "world-pack:slot-remove";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    packId: requiredNonEmptyString(obj, "packId", channel),
  };
}

export function parseWorldPackSlotToggleInput(
  value: unknown,
): WorldPackSlotToggleInput {
  const channel = "world-pack:slot-toggle";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    packId: requiredNonEmptyString(obj, "packId", channel),
    enabled: requiredBoolean(obj, "enabled", channel),
  };
}

export function parseWorldPackSlotReorderInput(
  value: unknown,
): WorldPackSlotReorderInput {
  const channel = "world-pack:slot-reorder";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    orderedPackIds: requiredStringArray(obj, "orderedPackIds", channel),
  };
}

export function parseWorldPackCoverWriteInput(
  value: unknown,
): WorldPackCoverWriteInput {
  const channel = "world-pack:cover-write";
  const obj = asObject(value, channel);
  return {
    packId: requiredNonEmptyString(obj, "packId", channel),
    ext: requiredNonEmptyString(obj, "ext", channel),
    bytes: requiredBinary(obj, "bytes", channel),
    mime: requiredNonEmptyString(obj, "mime", channel),
  };
}

export function parseWorldPackCoverReadInput(value: unknown): WorldPackCoverReadInput {
  const channel = "world-pack:cover-read";
  const obj = asObject(value, channel);
  return {
    packId: requiredNonEmptyString(obj, "packId", channel),
    coverPath: requiredNonEmptyString(obj, "coverPath", channel),
  };
}

export function parseWorldPackFuseInput(value: unknown): WorldPackFuseInput {
  const channel = "world-pack:fuse";
  const obj = asObject(value, channel);
  return {
    sourcePackIds: requiredStringArray(obj, "sourcePackIds", channel),
    brief: requiredString(obj, "brief", channel),
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
    persist: optionalBoolean(obj, "persist", channel),
    suggestion: optionalWorldPackFuseSuggestion(obj, "suggestion", channel),
  };
}
