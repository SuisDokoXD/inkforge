import type {
  SceneBindingResetInput,
  SceneBindingSetModeInput,
  SceneBindingUpsertInput,
  SceneKey,
  SceneRoutingMode,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  requiredEnum,
  type UnknownRecord,
} from "./core";

const SCENE_ROUTING_MODES = ["basic", "advanced"] as const satisfies readonly SceneRoutingMode[];
const SCENE_KEYS = [
  "outline_generation",
  "main_generation",
  "extract",
  "summarize",
  "inline",
  "analyze",
  "quick",
  "chat",
  "skill",
  "tavern",
  "auto-writer",
  "review",
  "daily-summary",
  "letter",
] as const satisfies readonly SceneKey[];

function requiredNullableString(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== "string") fail(channel, key, "a string or null");
  return value;
}

export function parseSceneBindingUpsertInput(value: unknown): SceneBindingUpsertInput {
  const channel = "scene-binding:upsert";
  const obj = asObject(value, channel);
  return {
    mode: requiredEnum(obj, "mode", channel, SCENE_ROUTING_MODES),
    sceneKey: requiredEnum(obj, "sceneKey", channel, SCENE_KEYS),
    providerId: requiredNullableString(obj, "providerId", channel),
    model: requiredNullableString(obj, "model", channel),
  };
}

export function parseSceneBindingResetInput(value: unknown): SceneBindingResetInput {
  const channel = "scene-binding:reset";
  const obj = asObject(value, channel);
  return {
    mode: requiredEnum(obj, "mode", channel, SCENE_ROUTING_MODES),
    sceneKey: requiredEnum(obj, "sceneKey", channel, SCENE_KEYS),
  };
}

export function parseSceneBindingSetModeInput(value: unknown): SceneBindingSetModeInput {
  const channel = "scene-binding:set-mode";
  const obj = asObject(value, channel);
  return {
    mode: requiredEnum(obj, "mode", channel, SCENE_ROUTING_MODES),
  };
}
