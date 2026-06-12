import type {
  ResearchCredentialDeleteInput,
  ResearchCredentialStatusInput,
  ResearchCredentialUpsertInput,
  ResearchDeleteInput,
  ResearchGetInput,
  ResearchListInput,
  ResearchProvider,
  ResearchSaveInput,
  ResearchSearchInput,
  ResearchUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  optionalEnumArray,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
} from "./core";

const RESEARCH_PROVIDERS = ["tavily", "bing", "serpapi", "llm-fallback", "manual"] as const;

export function parseResearchSearchInput(value: unknown): ResearchSearchInput {
  const channel = "research:search";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    query: requiredString(obj, "query", channel),
    provider: optionalEnum(obj, "provider", channel, RESEARCH_PROVIDERS) as
      | ResearchProvider
      | undefined,
    topK: optionalNumber(obj, "topK", channel),
    apiKey: optionalString(obj, "apiKey", channel),
  };
}

export function parseResearchListInput(value: unknown): ResearchListInput {
  const channel = "research:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    topic: optionalString(obj, "topic", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseResearchGetInput(value: unknown): ResearchGetInput {
  const channel = "research:get";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseResearchSaveInput(value: unknown): ResearchSaveInput {
  const channel = "research:save";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    topic: requiredString(obj, "topic", channel),
    sourceUrl: optionalNullableString(obj, "sourceUrl", channel),
    sourceTitle: optionalNullableString(obj, "sourceTitle", channel),
    sourceProvider: requiredEnum(obj, "sourceProvider", channel, RESEARCH_PROVIDERS) as
      ResearchProvider,
    excerpt: requiredString(obj, "excerpt", channel),
    note: optionalString(obj, "note", channel),
    tags: optionalStringArray(obj, "tags", channel),
  };
}

export function parseResearchUpdateInput(value: unknown): ResearchUpdateInput {
  const channel = "research:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    topic: optionalString(obj, "topic", channel),
    note: optionalString(obj, "note", channel),
    tags: optionalStringArray(obj, "tags", channel),
  };
}

export function parseResearchDeleteInput(value: unknown): ResearchDeleteInput {
  const channel = "research:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseResearchCredentialStatusInput(
  value: unknown,
): ResearchCredentialStatusInput {
  const channel = "research:credential-status";
  const obj = asObject(value, channel);
  return {
    providers: optionalEnumArray(obj, "providers", channel, RESEARCH_PROVIDERS) as
      | ResearchProvider[]
      | undefined,
  };
}

export function parseResearchCredentialUpsertInput(
  value: unknown,
): ResearchCredentialUpsertInput {
  const channel = "research:credential-upsert";
  const obj = asObject(value, channel);
  return {
    provider: requiredEnum(obj, "provider", channel, RESEARCH_PROVIDERS) as ResearchProvider,
    apiKey: requiredString(obj, "apiKey", channel),
  };
}

export function parseResearchCredentialDeleteInput(
  value: unknown,
): ResearchCredentialDeleteInput {
  const channel = "research:credential-delete";
  const obj = asObject(value, channel);
  return {
    provider: requiredEnum(obj, "provider", channel, RESEARCH_PROVIDERS) as ResearchProvider,
  };
}
