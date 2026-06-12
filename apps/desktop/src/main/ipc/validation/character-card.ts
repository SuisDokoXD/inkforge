import type {
  CharacterCardExportInput,
  CharacterCardImportInput,
  CharacterCardListImportsInput,
  VoiceProfileDeleteInput,
  VoiceProfileGetInput,
  VoiceProfileSetEnabledInput,
  VoiceProfileUpsertInput,
  WorldInfoTraceClearInput,
  WorldInfoTraceGetInput,
  WorldInfoTraceListRecentInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNullableString,
  optionalNumber,
  optionalRecordOfStrings,
  optionalString,
  requiredBoolean,
  requiredEnum,
  requiredNonEmptyString,
  type UnknownRecord,
} from "./core";

const CHARACTER_CARD_EXPORT_FORMATS = ["json", "png", "inkcard"] as const;

function requiredRecordOfStrings(
  obj: UnknownRecord,
  key: string,
  channel: string,
): Record<string, string> {
  const value = optionalRecordOfStrings(obj, key, channel);
  if (value === undefined) fail(channel, key, "an object with string values");
  return value;
}

function optionalArrayBuffer(
  obj: UnknownRecord,
  key: string,
  channel: string,
): ArrayBuffer | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!(value instanceof ArrayBuffer)) fail(channel, key, "an ArrayBuffer");
  return value;
}

export function parseCharacterCardImportInput(
  value: unknown,
): CharacterCardImportInput {
  const channel = "character-card:import";
  const obj = asObject(value, channel);
  return {
    sourcePath: requiredNonEmptyString(obj, "sourcePath", channel),
  };
}

export function parseCharacterCardExportInput(
  value: unknown,
): CharacterCardExportInput {
  const channel = "character-card:export";
  const obj = asObject(value, channel);
  return {
    packId: requiredNonEmptyString(obj, "packId", channel),
    format: requiredEnum(obj, "format", channel, CHARACTER_CARD_EXPORT_FORMATS),
    outputPath: requiredNonEmptyString(obj, "outputPath", channel),
    coverBytes: optionalArrayBuffer(obj, "coverBytes", channel),
  };
}

export function parseCharacterCardListImportsInput(
  value: unknown,
): CharacterCardListImportsInput {
  const channel = "character-card:list-imports";
  const obj = asObject(value, channel);
  return {
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseVoiceProfileGetInput(value: unknown): VoiceProfileGetInput {
  const channel = "voice-profile:get";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseVoiceProfileUpsertInput(
  value: unknown,
): VoiceProfileUpsertInput {
  const channel = "voice-profile:upsert";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    answers: requiredRecordOfStrings(obj, "answers", channel),
    promptBlock: optionalString(obj, "promptBlock", channel),
    enabled: optionalBoolean(obj, "enabled", channel),
    completedAt: optionalNullableString(obj, "completedAt", channel),
  };
}

export function parseVoiceProfileSetEnabledInput(
  value: unknown,
): VoiceProfileSetEnabledInput {
  const channel = "voice-profile:set-enabled";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    enabled: requiredBoolean(obj, "enabled", channel),
  };
}

export function parseVoiceProfileDeleteInput(value: unknown): VoiceProfileDeleteInput {
  const channel = "voice-profile:delete";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseWorldInfoTraceListRecentInput(
  value: unknown,
): WorldInfoTraceListRecentInput {
  const channel = "world-info-trace:list-recent";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseWorldInfoTraceGetInput(value: unknown): WorldInfoTraceGetInput {
  const channel = "world-info-trace:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseWorldInfoTraceClearInput(
  value: unknown,
): WorldInfoTraceClearInput {
  const channel = "world-info-trace:clear";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}
