// C13: Image generation IPC handlers
import { ipcMain } from "electron";
import type { ImageGenRequest, ImageGenResult, ImageGenSettings } from "@inkforge/shared";
import { generateImage } from "../services/image-gen-service";
import { getAppContext } from "../services/app-state";

export function registerImageGenHandlers(): void {
  ipcMain.handle("image-gen:generate", async (_e, input: unknown): Promise<ImageGenResult> => {
    return generateImage(input as ImageGenRequest);
  });

  ipcMain.handle("image-gen:get-settings", async (): Promise<ImageGenSettings> => {
    const ctx = getAppContext();
    const backendRow = ctx.db.prepare(`SELECT value FROM app_settings WHERE key = 'imageGenBackend'`).get() as { value: string } | undefined;
    const urlRow = ctx.db.prepare(`SELECT value FROM app_settings WHERE key = 'imageGenApiUrl'`).get() as { value: string } | undefined;
    return {
      backend: (backendRow?.value as ImageGenSettings["backend"]) ?? "none",
      apiUrl: urlRow?.value ?? "http://localhost:8188",
    };
  });

  ipcMain.handle("image-gen:save-settings", async (_e, input: unknown): Promise<{ ok: true }> => {
    const { backend, apiUrl } = input as ImageGenSettings;
    const ctx = getAppContext();
    const now = new Date().toISOString();
    ctx.db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('imageGenBackend', ?, ?)`).run(backend, now);
    ctx.db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('imageGenApiUrl', ?, ?)`).run(apiUrl, now);
    return { ok: true };
  });
}
