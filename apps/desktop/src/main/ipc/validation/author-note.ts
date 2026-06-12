import type {
  AuthorNoteDeleteInput,
  AuthorNoteGetInput,
  AuthorNotePosition,
  AuthorNoteUpsertInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalBoolean,
  optionalEnum,
  optionalString,
  requiredNonEmptyString,
} from "./core";

const AUTHOR_NOTE_POSITIONS = ["before", "after"] as const satisfies readonly AuthorNotePosition[];

export function parseAuthorNoteGetInput(value: unknown): AuthorNoteGetInput {
  const channel = "author-note:get";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseAuthorNoteUpsertInput(value: unknown): AuthorNoteUpsertInput {
  const channel = "author-note:upsert";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    text: optionalString(obj, "text", channel),
    position: optionalEnum(obj, "position", channel, AUTHOR_NOTE_POSITIONS),
    enabled: optionalBoolean(obj, "enabled", channel),
  };
}

export function parseAuthorNoteDeleteInput(value: unknown): AuthorNoteDeleteInput {
  const channel = "author-note:delete";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}
