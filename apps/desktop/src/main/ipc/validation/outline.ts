import type {
  OutlineCreateInput,
  OutlineDeleteInput,
  OutlineListInput,
  OutlineUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalNullableString,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
  requiredString,
} from "./core";

export function parseOutlineCreateInput(value: unknown): OutlineCreateInput {
  const channel = "outline:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: optionalNullableString(obj, "chapterId", channel),
    title: requiredString(obj, "title", channel),
    content: optionalString(obj, "content", channel),
    status: optionalString(obj, "status", channel),
    order: optionalNumber(obj, "order", channel),
  };
}

export function parseOutlineUpdateInput(value: unknown): OutlineUpdateInput {
  const channel = "outline:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    title: optionalString(obj, "title", channel),
    content: optionalString(obj, "content", channel),
    status: optionalString(obj, "status", channel),
    order: optionalNumber(obj, "order", channel),
    chapterId: optionalNullableString(obj, "chapterId", channel),
  };
}

export function parseOutlineDeleteInput(value: unknown): OutlineDeleteInput {
  const channel = "outline:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseOutlineListInput(value: unknown): OutlineListInput {
  const channel = "outline:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: optionalString(obj, "chapterId", channel),
  };
}
