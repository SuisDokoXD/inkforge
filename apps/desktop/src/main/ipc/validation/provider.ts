import type {
  ProviderDeleteInput,
  ProviderListRemoteModelsInput,
  ProviderSaveInput,
  ProviderTestInput,
  ProviderVendor,
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

const PROVIDER_VENDORS = [
  "anthropic",
  "openai",
  "gemini",
  "openai-compat",
] as const satisfies readonly ProviderVendor[];

export function parseProviderSaveInput(value: unknown): ProviderSaveInput {
  const channel = "provider:save";
  const obj = asObject(value, channel);
  return {
    id: optionalString(obj, "id", channel),
    label: requiredString(obj, "label", channel),
    vendor: requiredEnum(obj, "vendor", channel, PROVIDER_VENDORS),
    baseUrl: optionalString(obj, "baseUrl", channel),
    apiKey: optionalString(obj, "apiKey", channel),
    defaultModel: requiredString(obj, "defaultModel", channel),
    tags: optionalStringArray(obj, "tags", channel),
  };
}

export function parseProviderDeleteInput(value: unknown): ProviderDeleteInput {
  const channel = "provider:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseProviderTestInput(value: unknown): ProviderTestInput {
  const channel = "provider:test";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseProviderListRemoteModelsInput(
  value: unknown,
): ProviderListRemoteModelsInput {
  const channel = "provider:list-remote-models";
  const obj = asObject(value, channel);
  return {
    providerId: optionalString(obj, "providerId", channel),
    vendor: optionalEnum(obj, "vendor", channel, PROVIDER_VENDORS),
    baseUrl: optionalString(obj, "baseUrl", channel),
    apiKey: optionalString(obj, "apiKey", channel),
  };
}
