import type {
  WorldGraphEndpointKind,
  WorldRelationshipDeleteInput,
  WorldRelationshipListInput,
  WorldRelationshipSaveInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalNullableString,
  optionalNumber,
  optionalString,
  requiredEnum,
  requiredNonEmptyString,
} from "./core";

const WORLD_GRAPH_ENDPOINT_KINDS = [
  "character",
  "world_entry",
] as const satisfies readonly WorldGraphEndpointKind[];

export function parseWorldRelationshipListInput(
  value: unknown,
): WorldRelationshipListInput {
  const channel = "world-relationship:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseWorldRelationshipSaveInput(
  value: unknown,
): WorldRelationshipSaveInput {
  const channel = "world-relationship:save";
  const obj = asObject(value, channel);
  return {
    id: optionalString(obj, "id", channel),
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    srcKind: requiredEnum(obj, "srcKind", channel, WORLD_GRAPH_ENDPOINT_KINDS),
    srcId: requiredNonEmptyString(obj, "srcId", channel),
    dstKind: requiredEnum(obj, "dstKind", channel, WORLD_GRAPH_ENDPOINT_KINDS),
    dstId: requiredNonEmptyString(obj, "dstId", channel),
    label: optionalNullableString(obj, "label", channel),
    weight: optionalNumber(obj, "weight", channel),
  };
}

export function parseWorldRelationshipDeleteInput(
  value: unknown,
): WorldRelationshipDeleteInput {
  const channel = "world-relationship:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
