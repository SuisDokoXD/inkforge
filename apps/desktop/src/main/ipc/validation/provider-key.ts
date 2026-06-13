import type {
  ProviderKeyDeleteInput,
  ProviderKeyHealthInput,
  ProviderKeyListInput,
  ProviderKeySetDisabledInput,
  ProviderKeyStrategy,
  ProviderKeyUpsertInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  requiredBoolean,
  requiredNonEmptyString,
} from "./core";

const PROVIDER_KEY_STRATEGIES = ["single", "round-robin", "weighted", "sticky"] as const;

function optionalNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  channel: string,
): string | undefined {
  const value = optionalString(obj, key, channel);
  if (value !== undefined && value.length === 0) {
    fail(channel, key, "a non-empty string");
  }
  return value;
}

function optionalNonNegativeInteger(
  obj: Record<string, unknown>,
  key: string,
  channel: string,
): number | undefined {
  const value = optionalNumber(obj, key, channel);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    fail(channel, key, "a non-negative integer");
  }
  return value;
}

export function parseProviderKeyListInput(value: unknown): ProviderKeyListInput {
  const channel = "provider-key:list";
  const obj = asObject(value, channel);
  return {
    providerId: requiredNonEmptyString(obj, "providerId", channel),
  };
}

export function parseProviderKeyUpsertInput(value: unknown): ProviderKeyUpsertInput {
  const channel = "provider-key:upsert";
  const obj = asObject(value, channel);
  return {
    providerId: requiredNonEmptyString(obj, "providerId", channel),
    id: optionalNonEmptyString(obj, "id", channel),
    label: requiredNonEmptyString(obj, "label", channel),
    apiKey: optionalString(obj, "apiKey", channel),
    weight: optionalNonNegativeInteger(obj, "weight", channel),
    disabled: optionalBoolean(obj, "disabled", channel),
    strategy: optionalEnum(obj, "strategy", channel, PROVIDER_KEY_STRATEGIES) as
      | ProviderKeyStrategy
      | undefined,
    cooldownMs: optionalNonNegativeInteger(obj, "cooldownMs", channel),
  };
}

export function parseProviderKeyDeleteInput(value: unknown): ProviderKeyDeleteInput {
  const channel = "provider-key:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseProviderKeySetDisabledInput(value: unknown): ProviderKeySetDisabledInput {
  const channel = "provider-key:set-disabled";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    disabled: requiredBoolean(obj, "disabled", channel),
  };
}

export function parseProviderKeyHealthInput(value: unknown): ProviderKeyHealthInput {
  const channel = "provider-key:health";
  const obj = asObject(value, channel);
  return {
    providerId: requiredNonEmptyString(obj, "providerId", channel),
  };
}
