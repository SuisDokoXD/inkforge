import type {
  CharacterLetterTone,
  LetterDeleteInput,
  LetterDismissInput,
  LetterGenerateInput,
  LetterListInput,
  LetterMarkReadInput,
  LetterPinInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  requiredBoolean,
  requiredNonEmptyString,
} from "./core";

const CHARACTER_LETTER_TONES = [
  "grateful",
  "complaint",
  "curious",
  "encouraging",
  "neutral",
] as const satisfies readonly CharacterLetterTone[];

export function parseLetterListInput(value: unknown): LetterListInput {
  const channel = "letter:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    includeDismissed: optionalBoolean(obj, "includeDismissed", channel),
    characterId: optionalString(obj, "characterId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseLetterGenerateInput(value: unknown): LetterGenerateInput {
  const channel = "letter:generate";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    characterId: optionalString(obj, "characterId", channel),
    tone: optionalEnum(obj, "tone", channel, CHARACTER_LETTER_TONES),
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
  };
}

export function parseLetterMarkReadInput(value: unknown): LetterMarkReadInput {
  const channel = "letter:mark-read";
  const obj = asObject(value, channel);
  return {
    letterId: requiredNonEmptyString(obj, "letterId", channel),
    read: requiredBoolean(obj, "read", channel),
  };
}

export function parseLetterPinInput(value: unknown): LetterPinInput {
  const channel = "letter:pin";
  const obj = asObject(value, channel);
  return {
    letterId: requiredNonEmptyString(obj, "letterId", channel),
    pinned: requiredBoolean(obj, "pinned", channel),
  };
}

export function parseLetterDismissInput(value: unknown): LetterDismissInput {
  const channel = "letter:dismiss";
  const obj = asObject(value, channel);
  return {
    letterId: requiredNonEmptyString(obj, "letterId", channel),
  };
}

export function parseLetterDeleteInput(value: unknown): LetterDeleteInput {
  const channel = "letter:delete";
  const obj = asObject(value, channel);
  return {
    letterId: requiredNonEmptyString(obj, "letterId", channel),
  };
}
