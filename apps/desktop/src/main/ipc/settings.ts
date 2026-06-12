import { ipcMain } from "electron";
import { getAppSettings, setAppSettings } from "@inkforge/storage";
import type { AppSettings, ipcChannels } from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { parseSettingsGetInput, parseSettingsSetInput } from "./validation";

const SETTINGS_GET: typeof ipcChannels.settingsGet = "settings:get";
const SETTINGS_SET: typeof ipcChannels.settingsSet = "settings:set";

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_GET, async (_event, input: unknown): Promise<AppSettings> => {
    parseSettingsGetInput(input);
    const ctx = getAppContext();
    return getAppSettings(ctx.db);
  });
  ipcMain.handle(SETTINGS_SET, async (_event, input: unknown): Promise<AppSettings> => {
    const parsed = parseSettingsSetInput(input);
    const ctx = getAppContext();
    return setAppSettings(ctx.db, parsed.updates);
  });
}
