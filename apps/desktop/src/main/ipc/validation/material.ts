import type {
  MaterialCreateInput,
  MaterialDeleteInput,
  MaterialKind,
  MaterialListInput,
  MaterialUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
} from "./core";

const MATERIAL_KINDS = [
  "idea",
  "plot",
  "character",
  "location",
  "world",
  "fragment",
  "reference",
  "note",
] as const satisfies readonly MaterialKind[];

export function parseMaterialListInput(value: unknown): MaterialListInput {
  const channel = "material:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    kind: optionalEnum(obj, "kind", channel, MATERIAL_KINDS),
  };
}

export function parseMaterialCreateInput(value: unknown): MaterialCreateInput {
  const channel = "material:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    kind: requiredEnum(obj, "kind", channel, MATERIAL_KINDS),
    title: requiredString(obj, "title", channel),
    content: optionalString(obj, "content", channel),
    tags: optionalStringArray(obj, "tags", channel),
  };
}

export function parseMaterialUpdateInput(value: unknown): MaterialUpdateInput {
  const channel = "material:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    kind: optionalEnum(obj, "kind", channel, MATERIAL_KINDS),
    title: optionalString(obj, "title", channel),
    content: optionalString(obj, "content", channel),
    tags: optionalStringArray(obj, "tags", channel),
  };
}

export function parseMaterialDeleteInput(value: unknown): MaterialDeleteInput {
  const channel = "material:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
