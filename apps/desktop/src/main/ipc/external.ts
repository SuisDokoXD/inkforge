import { ipcMain } from "electron";
import type { ipcChannels } from "@inkforge/shared";
import { openExternalHttpUrl } from "../external-url";
import { parseExternalOpenUrlInput } from "./validation";

const EXTERNAL_OPEN_URL: typeof ipcChannels.externalOpenUrl = "external:open-url";

export function registerExternalHandlers(): void {
  ipcMain.handle(EXTERNAL_OPEN_URL, async (_event, payload: unknown): Promise<{ ok: true }> => {
    const input = parseExternalOpenUrlInput(payload);
    const opened = await openExternalHttpUrl(input.url);
    if (!opened) {
      throw new Error("external:open-url only accepts http/https URLs");
    }
    return { ok: true };
  });
}
