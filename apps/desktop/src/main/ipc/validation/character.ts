import type {
  CharacterSyncApplyInput,
  CharacterSyncField,
  CharacterSyncHistoryInput,
  CharacterSyncPreviewInput,
  CharacterSyncRequestDirection,
  CharacterSyncResolutionInput,
  NovelCharacterCreateInput,
  NovelCharacterDeleteInput,
  NovelCharacterExtractCandidate,
  NovelCharacterExtractInput,
  NovelCharacterExtractRelation,
  NovelCharacterGetInput,
  NovelCharacterImportCandidatesInput,
  NovelCharacterListInput,
  NovelCharacterUpdateInput,
  SyncMode,
  TavernCardCreateInput,
  TavernCardDeleteInput,
  TavernCardGetInput,
  TavernCardListInput,
  TavernCardUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalEnum,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredNonEmptyString,
  requiredNumber,
  requiredString,
  requiredStringArray,
  type UnknownRecord,
} from "./core";

const TAVERN_CARD_SYNC_MODES = [
  "two-way",
  "snapshot",
  "detached",
] as const satisfies readonly SyncMode[];

const CHARACTER_SYNC_DIRECTIONS = [
  "novel_to_card",
  "card_to_novel",
  "auto",
] as const satisfies readonly CharacterSyncRequestDirection[];

const CHARACTER_SYNC_FIELDS = [
  "persona",
  "backstory",
  "traits",
] as const satisfies readonly CharacterSyncField[];

const CHARACTER_SYNC_WINNERS = ["novel", "card"] as const;

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

function optionalRelations(
  obj: UnknownRecord,
  channel: string,
): Array<{ otherId: string; label: string }> | undefined {
  const value = obj.relations;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, "relations", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `relations[${index}]`, "an object");
    }
    const relation = item as UnknownRecord;
    return {
      otherId: requiredNonEmptyString(relation, "otherId", channel),
      label: requiredString(relation, "label", channel),
    };
  });
}

function parseNovelCharacterEditableFields(obj: UnknownRecord, channel: string) {
  return {
    persona: optionalNullableString(obj, "persona", channel),
    traits: optionalUnknownRecord(obj, "traits", channel),
    backstory: optionalString(obj, "backstory", channel),
    relations: optionalRelations(obj, channel),
    linkedTavernCardId: optionalNullableString(obj, "linkedTavernCardId", channel),
  };
}

function parseTavernCardEditableFields(obj: UnknownRecord, channel: string) {
  return {
    avatarPath: optionalNullableString(obj, "avatarPath", channel),
    temperature: optionalNumber(obj, "temperature", channel),
    linkedNovelCharacterId: optionalNullableString(obj, "linkedNovelCharacterId", channel),
    syncMode: optionalEnum(obj, "syncMode", channel, TAVERN_CARD_SYNC_MODES),
  };
}

function parseExtractCandidate(
  item: unknown,
  index: number,
  channel: string,
): NovelCharacterExtractCandidate {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail(channel, `candidates[${index}]`, "an object");
  }
  const candidate = item as UnknownRecord;
  return {
    name: requiredString(candidate, "name", channel),
    aliases: requiredStringArray(candidate, "aliases", channel),
    persona: requiredString(candidate, "persona", channel),
    backstory: requiredString(candidate, "backstory", channel),
    evidence: requiredString(candidate, "evidence", channel),
    confidence: requiredNumber(candidate, "confidence", channel),
  };
}

function parseExtractRelation(
  item: unknown,
  index: number,
  channel: string,
): NovelCharacterExtractRelation {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail(channel, `relationships[${index}]`, "an object");
  }
  const relation = item as UnknownRecord;
  return {
    sourceName: requiredString(relation, "sourceName", channel),
    targetName: requiredString(relation, "targetName", channel),
    label: requiredString(relation, "label", channel),
    evidence: requiredString(relation, "evidence", channel),
    confidence: requiredNumber(relation, "confidence", channel),
  };
}

function requiredExtractCandidates(
  obj: UnknownRecord,
  channel: string,
): NovelCharacterExtractCandidate[] {
  const value = obj.candidates;
  if (!Array.isArray(value)) fail(channel, "candidates", "an array");
  return value.map((item, index) => parseExtractCandidate(item, index, channel));
}

function optionalExtractRelations(
  obj: UnknownRecord,
  channel: string,
): NovelCharacterExtractRelation[] | undefined {
  const value = obj.relationships;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, "relationships", "an array");
  return value.map((item, index) => parseExtractRelation(item, index, channel));
}

function optionalSyncResolutions(
  obj: UnknownRecord,
  channel: string,
): CharacterSyncResolutionInput[] | undefined {
  const value = obj.resolutions;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, "resolutions", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `resolutions[${index}]`, "an object");
    }
    const resolution = item as UnknownRecord;
    return {
      field: requiredEnum(resolution, "field", channel, CHARACTER_SYNC_FIELDS),
      winner: requiredEnum(resolution, "winner", channel, CHARACTER_SYNC_WINNERS),
    };
  });
}

export function parseTavernCardCreateInput(value: unknown): TavernCardCreateInput {
  const channel = "tavern-card:create";
  const obj = asObject(value, channel);
  return {
    name: requiredString(obj, "name", channel),
    persona: requiredString(obj, "persona", channel),
    providerId: requiredNonEmptyString(obj, "providerId", channel),
    model: requiredString(obj, "model", channel),
    ...parseTavernCardEditableFields(obj, channel),
  };
}

export function parseTavernCardUpdateInput(value: unknown): TavernCardUpdateInput {
  const channel = "tavern-card:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    name: optionalString(obj, "name", channel),
    persona: optionalString(obj, "persona", channel),
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
    ...parseTavernCardEditableFields(obj, channel),
  };
}

export function parseTavernCardGetInput(value: unknown): TavernCardGetInput {
  const channel = "tavern-card:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseTavernCardListInput(value: unknown): TavernCardListInput {
  const channel = "tavern-card:list";
  const obj = asObject(value, channel);
  return {
    projectId: optionalString(obj, "projectId", channel),
  };
}

export function parseTavernCardDeleteInput(value: unknown): TavernCardDeleteInput {
  const channel = "tavern-card:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseNovelCharacterCreateInput(
  value: unknown,
): NovelCharacterCreateInput {
  const channel = "novel-character:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    name: requiredString(obj, "name", channel),
    ...parseNovelCharacterEditableFields(obj, channel),
  };
}

export function parseNovelCharacterUpdateInput(
  value: unknown,
): NovelCharacterUpdateInput {
  const channel = "novel-character:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    name: optionalString(obj, "name", channel),
    ...parseNovelCharacterEditableFields(obj, channel),
  };
}

export function parseNovelCharacterGetInput(value: unknown): NovelCharacterGetInput {
  const channel = "novel-character:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseNovelCharacterListInput(value: unknown): NovelCharacterListInput {
  const channel = "novel-character:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseNovelCharacterDeleteInput(
  value: unknown,
): NovelCharacterDeleteInput {
  const channel = "novel-character:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseNovelCharacterExtractInput(
  value: unknown,
): NovelCharacterExtractInput {
  const channel = "novel-character:extract-from-chapter";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    maxCandidates: optionalNumber(obj, "maxCandidates", channel),
  };
}

export function parseNovelCharacterImportCandidatesInput(
  value: unknown,
): NovelCharacterImportCandidatesInput {
  const channel = "novel-character:import-candidates";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: optionalString(obj, "chapterId", channel),
    candidates: requiredExtractCandidates(obj, channel),
    relationships: optionalExtractRelations(obj, channel),
  };
}

export function parseCharacterSyncPreviewInput(
  value: unknown,
): CharacterSyncPreviewInput {
  const channel = "character-sync:preview";
  const obj = asObject(value, channel);
  return {
    novelCharId: requiredNonEmptyString(obj, "novelCharId", channel),
    tavernCardId: requiredNonEmptyString(obj, "tavernCardId", channel),
    direction: optionalEnum(obj, "direction", channel, CHARACTER_SYNC_DIRECTIONS),
  };
}

export function parseCharacterSyncApplyInput(value: unknown): CharacterSyncApplyInput {
  const channel = "character-sync:apply";
  const obj = asObject(value, channel);
  return {
    novelCharId: requiredNonEmptyString(obj, "novelCharId", channel),
    tavernCardId: requiredNonEmptyString(obj, "tavernCardId", channel),
    direction: requiredEnum(obj, "direction", channel, CHARACTER_SYNC_DIRECTIONS),
    resolutions: optionalSyncResolutions(obj, channel),
  };
}

export function parseCharacterSyncHistoryInput(
  value: unknown,
): CharacterSyncHistoryInput {
  const channel = "character-sync:history";
  const obj = asObject(value, channel);
  return {
    novelCharId: optionalString(obj, "novelCharId", channel),
    tavernCardId: optionalString(obj, "tavernCardId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}
