import { describe, expect, it } from "vitest";
import type { AppSettings } from "@inkforge/shared";
import type { DB } from "../db";
import { getAppSettings, setAppSettings } from "../repositories/app-settings-repo";

type SettingRow = { key: string; value: string };

class MemorySettingsDb {
  private readonly rows = new Map<string, string>();

  constructor(seed: SettingRow[] = []) {
    for (const row of seed) {
      this.rows.set(row.key, row.value);
    }
  }

  prepare(sql: string): { all?: () => SettingRow[]; run?: (entry: SettingRow) => void } {
    if (sql.includes("SELECT key, value FROM app_settings")) {
      return {
        all: () => Array.from(this.rows, ([key, value]) => ({ key, value })),
      };
    }

    return {
      run: (entry) => {
        this.rows.set(entry.key, entry.value);
      },
    };
  }

  transaction<T extends unknown[]>(fn: (...args: T) => unknown): (...args: T) => unknown {
    return (...args: T) => fn(...args);
  }

  get(key: string): string | undefined {
    return this.rows.get(key);
  }

  asDb(): DB {
    return this as unknown as DB;
  }
}

describe("app settings repository", () => {
  it("merges stored rows with defaults and clamps invalid persisted values", () => {
    const db = new MemorySettingsDb([
      { key: "theme", value: "neon" },
      { key: "activeProviderId", value: "" },
      { key: "analysisEnabled", value: "false" },
      { key: "analysisThreshold", value: "-1" },
      { key: "uiLanguage", value: "unknown" },
      { key: "sceneRoutingMode", value: "advanced" },
      { key: "editorFontSize", value: "99" },
      { key: "editorLineHeight", value: "2.2" },
      { key: "editorWidth", value: "wide" },
      { key: "typewriterMode", value: "true" },
      { key: "autoIndent", value: "false" },
      { key: "spellcheck", value: "false" },
      { key: "focusMode", value: "true" },
      { key: "unknownSetting", value: "ignored" },
    ]).asDb();

    expect(getAppSettings(db)).toMatchObject({
      theme: "dark",
      activeProviderId: null,
      analysisEnabled: false,
      analysisThreshold: 200,
      uiLanguage: "zh",
      sceneRoutingMode: "advanced",
      editorFontSize: 16,
      editorLineHeight: 2.2,
      editorWidth: "wide",
      typewriterMode: true,
      autoIndent: false,
      spellcheck: false,
      focusMode: true,
    });
  });

  it("persists only known settings and encodes booleans/nulls consistently", () => {
    const memoryDb = new MemorySettingsDb();
    const updates = {
      theme: "paper",
      activeProviderId: null,
      devModeEnabled: true,
      analysisThreshold: 512,
      notASetting: "ignored",
    } as Partial<AppSettings> & Record<string, unknown>;

    const next = setAppSettings(memoryDb.asDb(), updates);

    expect(memoryDb.get("theme")).toBe("paper");
    expect(memoryDb.get("activeProviderId")).toBe("");
    expect(memoryDb.get("devModeEnabled")).toBe("true");
    expect(memoryDb.get("analysisThreshold")).toBe("512");
    expect(memoryDb.get("notASetting")).toBeUndefined();
    expect(next).toMatchObject({
      theme: "paper",
      activeProviderId: null,
      devModeEnabled: true,
      analysisThreshold: 512,
    });
  });
});
