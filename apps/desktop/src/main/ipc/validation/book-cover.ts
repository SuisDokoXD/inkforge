import type {
  BookCoverDeleteInput,
  BookCoverGetInput,
  BookCoverUploadInput,
} from "@inkforge/shared";
import {
  asObject,
  requiredNonEmptyString,
  requiredString,
} from "./core";

export function parseBookCoverUploadInput(value: unknown): BookCoverUploadInput {
  const channel = "book-cover:upload";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    fileName: requiredNonEmptyString(obj, "fileName", channel),
    base64: requiredString(obj, "base64", channel),
    mime: requiredNonEmptyString(obj, "mime", channel),
  };
}

export function parseBookCoverGetInput(value: unknown): BookCoverGetInput {
  const channel = "book-cover:get";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseBookCoverDeleteInput(value: unknown): BookCoverDeleteInput {
  const channel = "book-cover:delete";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}
