import type {
  ReviewApplyFixInput,
  ReviewBuiltinId,
  ReviewCancelInput,
  ReviewDimDeleteInput,
  ReviewDimListInput,
  ReviewDimReorderInput,
  ReviewDimUpsertInput,
  ReviewDimensionKind,
  ReviewDismissFindingInput,
  ReviewExportInput,
  ReviewGetInput,
  ReviewListInput,
  ReviewRunInput,
  ReviewScope,
  ReviewSeverity,
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
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  requiredStringArray,
  type UnknownRecord,
} from "./core";

const REVIEW_BUILTIN_IDS = [
  "consistency-character",
  "consistency-timeline",
  "foreshadowing",
  "worldbuilding",
  "style",
] as const satisfies readonly ReviewBuiltinId[];

const REVIEW_DIMENSION_KINDS = ["builtin", "skill"] as const satisfies readonly ReviewDimensionKind[];
const REVIEW_SCOPES = ["book", "chapter", "selection"] as const satisfies readonly ReviewScope[];
const REVIEW_SEVERITIES = ["info", "warn", "error"] as const satisfies readonly ReviewSeverity[];
const REVIEW_RANGE_KINDS = ["book", "chapter", "range"] as const;
const REVIEW_EXPORT_FORMATS = ["md"] as const;
const REVIEW_FIX_MODES = ["preview", "apply"] as const;

function requiredNullableString(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (value === undefined) fail(channel, key, "a string or null");
  if (typeof value !== "string") fail(channel, key, "a string or null");
  return value;
}

function optionalNullableEnum<T extends string>(
  obj: UnknownRecord,
  key: string,
  channel: string,
  allowed: readonly T[],
): T | null | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(channel, key, `one of ${allowed.join(", ")} or null`);
  }
  return value as T;
}

export function parseReviewDimListInput(value: unknown): ReviewDimListInput {
  const channel = "review-dim:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseReviewDimUpsertInput(value: unknown): ReviewDimUpsertInput {
  const channel = "review-dim:upsert";
  const obj = asObject(value, channel);
  return {
    id: optionalString(obj, "id", channel),
    projectId: requiredNullableString(obj, "projectId", channel),
    name: requiredString(obj, "name", channel),
    kind: requiredEnum(obj, "kind", channel, REVIEW_DIMENSION_KINDS),
    builtinId: optionalNullableEnum(obj, "builtinId", channel, REVIEW_BUILTIN_IDS),
    skillId: optionalNullableString(obj, "skillId", channel),
    scope: optionalEnum(obj, "scope", channel, REVIEW_SCOPES),
    severity: optionalEnum(obj, "severity", channel, REVIEW_SEVERITIES),
    enabled: optionalBoolean(obj, "enabled", channel),
    order: optionalNumber(obj, "order", channel),
  };
}

export function parseReviewDimDeleteInput(value: unknown): ReviewDimDeleteInput {
  const channel = "review-dim:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseReviewDimReorderInput(value: unknown): ReviewDimReorderInput {
  const channel = "review-dim:reorder";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    orderedIds: requiredStringArray(obj, "orderedIds", channel),
  };
}

export function parseReviewRunInput(value: unknown): ReviewRunInput {
  const channel = "review:run";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    rangeKind: requiredEnum(obj, "rangeKind", channel, REVIEW_RANGE_KINDS),
    rangeIds: optionalStringArray(obj, "rangeIds", channel),
    dimensionIds: optionalStringArray(obj, "dimensionIds", channel),
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
  };
}

export function parseReviewCancelInput(value: unknown): ReviewCancelInput {
  const channel = "review:cancel";
  const obj = asObject(value, channel);
  return {
    reportId: requiredNonEmptyString(obj, "reportId", channel),
  };
}

export function parseReviewListInput(value: unknown): ReviewListInput {
  const channel = "review:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseReviewGetInput(value: unknown): ReviewGetInput {
  const channel = "review:get";
  const obj = asObject(value, channel);
  return {
    reportId: requiredNonEmptyString(obj, "reportId", channel),
  };
}

export function parseReviewDismissFindingInput(
  value: unknown,
): ReviewDismissFindingInput {
  const channel = "review:dismiss-finding";
  const obj = asObject(value, channel);
  return {
    findingId: requiredNonEmptyString(obj, "findingId", channel),
    dismissed: optionalBoolean(obj, "dismissed", channel),
  };
}

export function parseReviewExportInput(value: unknown): ReviewExportInput {
  const channel = "review:export";
  const obj = asObject(value, channel);
  return {
    reportId: requiredNonEmptyString(obj, "reportId", channel),
    format: optionalEnum(obj, "format", channel, REVIEW_EXPORT_FORMATS),
  };
}

export function parseReviewApplyFixInput(value: unknown): ReviewApplyFixInput {
  const channel = "review:apply-fix";
  const obj = asObject(value, channel);
  return {
    findingId: requiredNonEmptyString(obj, "findingId", channel),
    mode: requiredEnum(obj, "mode", channel, REVIEW_FIX_MODES),
    model: optionalString(obj, "model", channel),
    providerId: optionalString(obj, "providerId", channel),
  };
}
