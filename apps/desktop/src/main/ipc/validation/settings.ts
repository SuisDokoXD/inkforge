import type { AppSettings, SettingsGetInput, SettingsSetInput } from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalString,
  type UnknownRecord,
} from "./core";

const APP_SETTING_KEYS = [
  "theme",
  "activeProviderId",
  "analysisEnabled",
  "analysisThreshold",
  "uiLanguage",
  "devModeEnabled",
  "onboardingCompleted",
  "sceneRoutingMode",
  "editorFontSize",
  "editorLineHeight",
  "editorWidth",
  "typewriterMode",
  "autoIndent",
  "spellcheck",
  "focusMode",
  "customAccent",
] as const satisfies readonly (keyof AppSettings)[];

const APP_SETTING_KEY_SET = new Set<string>(APP_SETTING_KEYS);

function optionalSettingsUpdates(
  obj: UnknownRecord,
  channel: string,
): Partial<AppSettings> {
  const value = obj.updates;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, "updates", "an object");
  }
  const updates = value as UnknownRecord;
  const parsed: Partial<AppSettings> = {};
  const parsedRecord = parsed as Record<string, unknown>;
  for (const [key, entry] of Object.entries(updates)) {
    if (!APP_SETTING_KEY_SET.has(key)) continue;
    switch (key as keyof AppSettings) {
      case "theme":
        if (entry !== "dark" && entry !== "light" && entry !== "paper" && entry !== "sepia" && entry !== "mint") {
          fail(channel, key, "dark, light, paper, sepia, or mint");
        }
        parsed.theme = entry;
        break;
      case "activeProviderId":
        if (entry !== null && typeof entry !== "string") {
          fail(channel, key, "a string or null");
        }
        parsed.activeProviderId = entry;
        break;
      case "analysisEnabled":
      case "devModeEnabled":
      case "onboardingCompleted":
      case "typewriterMode":
      case "autoIndent":
      case "spellcheck":
      case "focusMode":
        if (typeof entry !== "boolean") fail(channel, key, "a boolean");
        parsedRecord[key] = entry;
        break;
      case "analysisThreshold":
      case "editorFontSize":
      case "editorLineHeight":
        if (typeof entry !== "number" || !Number.isFinite(entry)) {
          fail(channel, key, "a finite number");
        }
        parsedRecord[key] = entry;
        break;
      case "uiLanguage":
        if (entry !== "zh" && entry !== "en" && entry !== "ja") {
          fail(channel, key, "zh, en, or ja");
        }
        parsed.uiLanguage = entry;
        break;
      case "sceneRoutingMode":
        if (entry !== "basic" && entry !== "advanced") {
          fail(channel, key, "basic or advanced");
        }
        parsed.sceneRoutingMode = entry;
        break;
      case "editorWidth":
        if (entry !== "narrow" && entry !== "medium" && entry !== "wide") {
          fail(channel, key, "narrow, medium, or wide");
        }
        parsed.editorWidth = entry;
        break;
      case "customAccent":
        if (entry !== null && (typeof entry !== "string" || !/^#[0-9a-fA-F]{6}$/.test(entry))) {
          fail(channel, key, "a hex color or null");
        }
        parsed.customAccent = entry;
        break;
    }
  }
  return parsed;
}

export function parseSettingsGetInput(value: unknown): SettingsGetInput {
  const channel = "settings:get";
  const obj = asObject(value, channel);
  return {
    key: optionalString(obj, "key", channel),
  };
}

export function parseSettingsSetInput(value: unknown): SettingsSetInput {
  const channel = "settings:set";
  const obj = asObject(value, channel);
  return {
    updates: optionalSettingsUpdates(obj, channel),
  };
}
