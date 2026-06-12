import type {
  SkillBinding,
  SkillCreateInput,
  SkillDeleteInput,
  SkillExportJsonInput,
  SkillGetInput,
  SkillImportJsonInput,
  SkillListInput,
  SkillOutputTarget,
  SkillRunInput,
  SkillScope,
  SkillTriggerDef,
  SkillTriggerType,
  SkillUpdateInput,
  SkillVariableDef,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalRecordOfStrings,
  optionalString,
  optionalStringArray,
  requiredBoolean,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

export const SKILL_SCOPES = ["global", "project", "community"] as const;
const SKILL_TRIGGER_TYPES = [
  "selection",
  "every-n-chars",
  "on-save",
  "on-chapter-end",
  "manual",
] as const;
const SKILL_OUTPUT_TARGETS = [
  "ai-feedback",
  "replace-selection",
  "insert-after-selection",
  "append-chapter",
] as const;
const SKILL_IMPORT_CONFLICTS = ["replace", "skip", "rename"] as const;

function parseSkillVariable(value: unknown, channel: string, field: string): SkillVariableDef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, field, "an object");
  }
  const obj = value as UnknownRecord;
  return {
    key: requiredNonEmptyString(obj, "key", channel),
    label: requiredString(obj, "label", channel),
    required: requiredBoolean(obj, "required", channel),
    defaultValue: optionalString(obj, "defaultValue", channel),
    description: optionalString(obj, "description", channel),
  };
}

function optionalSkillVariables(
  obj: UnknownRecord,
  key: string,
  channel: string,
): SkillVariableDef[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, key, "an array");
  return value.map((item, index) => parseSkillVariable(item, channel, `${key}[${index}]`));
}

function requiredSkillVariables(
  obj: UnknownRecord,
  key: string,
  channel: string,
): SkillVariableDef[] {
  const value = optionalSkillVariables(obj, key, channel);
  if (value === undefined) fail(channel, key, "an array");
  return value;
}

function parseSkillTrigger(value: unknown, channel: string, field: string): SkillTriggerDef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, field, "an object");
  }
  const obj = value as UnknownRecord;
  return {
    type: requiredEnum(obj, "type", channel, SKILL_TRIGGER_TYPES) as SkillTriggerType,
    enabled: requiredBoolean(obj, "enabled", channel),
    everyNChars: optionalNumber(obj, "everyNChars", channel),
    debounceMs: optionalNumber(obj, "debounceMs", channel),
    cooldownMs: optionalNumber(obj, "cooldownMs", channel),
  };
}

function optionalSkillTriggers(
  obj: UnknownRecord,
  key: string,
  channel: string,
): SkillTriggerDef[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, key, "an array");
  return value.map((item, index) => parseSkillTrigger(item, channel, `${key}[${index}]`));
}

function requiredSkillTriggers(
  obj: UnknownRecord,
  key: string,
  channel: string,
): SkillTriggerDef[] {
  const value = optionalSkillTriggers(obj, key, channel);
  if (value === undefined) fail(channel, key, "an array");
  return value;
}

function parseSkillBinding(value: unknown, channel: string, field: string): SkillBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, field, "an object");
  }
  const obj = value as UnknownRecord;
  return {
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
    temperature: optionalNumber(obj, "temperature", channel),
    maxTokens: optionalNumber(obj, "maxTokens", channel),
    summaryProviderId: optionalString(obj, "summaryProviderId", channel),
    summaryModel: optionalString(obj, "summaryModel", channel),
  };
}

function optionalSkillBinding(
  obj: UnknownRecord,
  key: string,
  channel: string,
): SkillBinding | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  return parseSkillBinding(value, channel, key);
}

function requiredSkillBinding(obj: UnknownRecord, key: string, channel: string): SkillBinding {
  const value = obj[key];
  if (value === undefined) fail(channel, key, "an object");
  return parseSkillBinding(value, channel, key);
}

export function parseSkillCreateInput(value: unknown): SkillCreateInput {
  const channel = "skill:create";
  const obj = asObject(value, channel);
  return {
    name: requiredString(obj, "name", channel),
    prompt: requiredString(obj, "prompt", channel),
    variables: requiredSkillVariables(obj, "variables", channel),
    triggers: requiredSkillTriggers(obj, "triggers", channel),
    binding: requiredSkillBinding(obj, "binding", channel),
    output: requiredEnum(obj, "output", channel, SKILL_OUTPUT_TARGETS) as SkillOutputTarget,
    enabled: optionalBoolean(obj, "enabled", channel),
    scope: requiredEnum(obj, "scope", channel, SKILL_SCOPES) as SkillScope,
  };
}

export function parseSkillUpdateInput(value: unknown): SkillUpdateInput {
  const channel = "skill:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    name: optionalString(obj, "name", channel),
    prompt: optionalString(obj, "prompt", channel),
    variables: optionalSkillVariables(obj, "variables", channel),
    triggers: optionalSkillTriggers(obj, "triggers", channel),
    binding: optionalSkillBinding(obj, "binding", channel),
    output: optionalEnum(obj, "output", channel, SKILL_OUTPUT_TARGETS) as
      | SkillOutputTarget
      | undefined,
    enabled: optionalBoolean(obj, "enabled", channel),
    scope: optionalEnum(obj, "scope", channel, SKILL_SCOPES) as SkillScope | undefined,
  };
}

export function parseSkillGetInput(value: unknown): SkillGetInput {
  const channel = "skill:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseSkillListInput(value: unknown): SkillListInput {
  const channel = "skill:list";
  const obj = asObject(value, channel);
  return {
    scope: optionalEnum(obj, "scope", channel, SKILL_SCOPES) as SkillScope | undefined,
    enabledOnly: optionalBoolean(obj, "enabledOnly", channel),
    projectId: optionalString(obj, "projectId", channel),
  };
}

export function parseSkillDeleteInput(value: unknown): SkillDeleteInput {
  const channel = "skill:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseSkillRunInput(value: unknown): SkillRunInput {
  const channel = "skill:run";
  const obj = asObject(value, channel);
  const characterValue = obj.character;
  let character: SkillRunInput["character"];
  if (characterValue !== undefined) {
    if (!characterValue || typeof characterValue !== "object" || Array.isArray(characterValue)) {
      fail(channel, "character", "an object");
    }
    const characterObj = characterValue as UnknownRecord;
    character = {
      id: optionalString(characterObj, "id", channel),
      name: optionalString(characterObj, "name", channel),
      persona: optionalString(characterObj, "persona", channel),
    };
  }
  return {
    skillId: requiredNonEmptyString(obj, "skillId", channel),
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    chapterTitle: requiredString(obj, "chapterTitle", channel),
    chapterText: requiredString(obj, "chapterText", channel),
    selection: optionalString(obj, "selection", channel),
    character,
    manualVariables: optionalRecordOfStrings(obj, "manualVariables", channel),
    triggerType: optionalEnum(obj, "triggerType", channel, SKILL_TRIGGER_TYPES) as
      | SkillTriggerType
      | undefined,
    persist: optionalBoolean(obj, "persist", channel),
  };
}

export function parseSkillImportJsonInput(value: unknown): SkillImportJsonInput {
  const channel = "skill:import-json";
  const obj = asObject(value, channel);
  return {
    content: requiredString(obj, "content", channel),
    onConflict: optionalEnum(obj, "onConflict", channel, SKILL_IMPORT_CONFLICTS),
    scopeOverride: optionalEnum(obj, "scopeOverride", channel, SKILL_SCOPES) as
      | SkillScope
      | undefined,
  };
}

export function parseSkillExportJsonInput(value: unknown): SkillExportJsonInput {
  const channel = "skill:export-json";
  const obj = asObject(value, channel);
  return {
    ids: optionalStringArray(obj, "ids", channel),
    scope: optionalEnum(obj, "scope", channel, SKILL_SCOPES) as SkillScope | undefined,
    includeDisabled: optionalBoolean(obj, "includeDisabled", channel),
  };
}
