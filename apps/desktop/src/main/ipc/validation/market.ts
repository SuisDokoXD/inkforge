import type {
  MarketBuildPublishBundleInput,
  MarketFetchRegistryInput,
  MarketInstallSkillInput,
  SkillScope,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  optionalNullableString,
  optionalString,
  requiredNonEmptyString,
} from "./core";
import { SKILL_SCOPES } from "./skill";

export function parseMarketFetchRegistryInput(value: unknown): MarketFetchRegistryInput {
  const channel = "market:fetch-registry";
  const obj = asObject(value, channel);
  return {
    registryUrl: optionalString(obj, "registryUrl", channel),
  };
}

export function parseMarketInstallSkillInput(value: unknown): MarketInstallSkillInput {
  const channel = "market:install-skill";
  const obj = asObject(value, channel);
  return {
    url: requiredNonEmptyString(obj, "url", channel),
    scope: optionalEnum(obj, "scope", channel, SKILL_SCOPES) as SkillScope | undefined,
    projectId: optionalNullableString(obj, "projectId", channel),
  };
}

export function parseMarketBuildPublishBundleInput(
  value: unknown,
): MarketBuildPublishBundleInput {
  const channel = "market:build-publish-bundle";
  const obj = asObject(value, channel);
  return {
    skillId: requiredNonEmptyString(obj, "skillId", channel),
  };
}
