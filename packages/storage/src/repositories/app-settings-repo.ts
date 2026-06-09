import type { DB } from "../db";
import type { AppSettings, SceneRoutingMode } from "@inkforge/shared";
import { coerceLang } from "@inkforge/shared";

const DEFAULTS: AppSettings = {
  theme: "light",
  activeProviderId: null,
  analysisEnabled: true,
  analysisThreshold: 200,
  uiLanguage: "zh",
  devModeEnabled: false,
  onboardingCompleted: false,
  sceneRoutingMode: "basic",
  editorFontSize: 16,
  editorLineHeight: 2.0,
  editorWidth: "medium",
  typewriterMode: false,
  autoIndent: true,
  spellcheck: true,
  focusMode: false,
};

type SettingRow = { key: string; value: string };

function parseValue(key: keyof AppSettings, raw: string): AppSettings[keyof AppSettings] {
  switch (key) {
    case "theme":
      return raw === "light" ? "light" : "dark";
    case "activeProviderId":
      return raw ? raw : null;
    case "analysisEnabled":
    case "devModeEnabled":
    case "onboardingCompleted":
      return raw === "true";
    case "analysisThreshold": {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS.analysisThreshold;
    }
    case "editorFontSize": {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed >= 12 && parsed <= 28
        ? parsed
        : DEFAULTS.editorFontSize;
    }
    case "editorLineHeight": {
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) && parsed >= 1.4 && parsed <= 2.6
        ? parsed
        : DEFAULTS.editorLineHeight;
    }
    case "editorWidth":
      return raw === "narrow" || raw === "wide" ? raw : DEFAULTS.editorWidth;
    case "typewriterMode":
    case "autoIndent":
    case "spellcheck":
    case "focusMode":
      return raw === "true";
    case "uiLanguage":
      return coerceLang(raw, DEFAULTS.uiLanguage);
    case "sceneRoutingMode":
      return raw === "advanced" ? "advanced" : ("basic" as SceneRoutingMode);
    default:
      return raw as AppSettings[keyof AppSettings];
  }
}

function encodeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function getAppSettings(db: DB): AppSettings {
  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as SettingRow[];
  const snapshot: AppSettings = { ...DEFAULTS };
  for (const row of rows) {
    if ((row.key as keyof AppSettings) in DEFAULTS) {
      (snapshot as unknown as Record<string, unknown>)[row.key] = parseValue(
        row.key as keyof AppSettings,
        row.value,
      );
    }
  }
  return snapshot;
}

export function setAppSettings(db: DB, updates: Partial<AppSettings>): AppSettings {
  const stmt = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const tx = db.transaction((entries: [string, string][]) => {
    entries.forEach(([key, value]) => stmt.run({ key, value }));
  });
  const entries: [string, string][] = Object.entries(updates)
    .filter(([key]) => (key as keyof AppSettings) in DEFAULTS)
    .map(([key, value]) => [key, encodeValue(value)]);
  if (entries.length > 0) tx(entries);
  return getAppSettings(db);
}
