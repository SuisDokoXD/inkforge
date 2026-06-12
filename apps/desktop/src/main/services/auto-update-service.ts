import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";
import { logger } from "./logger";
import { openExternalHttpUrl } from "../external-url";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string; releaseUrl: string | null }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

const listeners = new Set<(status: UpdateStatus) => void>();
let latest: UpdateStatus = { state: "idle" };

function emit(next: UpdateStatus): void {
  latest = next;
  for (const l of listeners) {
    try {
      l(next);
    } catch {
      /* ignore */
    }
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("update:status", next);
  }
}

export function getLatestUpdateStatus(): UpdateStatus {
  return latest;
}

export function subscribeUpdateStatus(cb: (status: UpdateStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let wired = false;

export function initAutoUpdater(options?: { feedUrl?: string }): void {
  if (wired) return;
  wired = true;

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (options?.feedUrl) {
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: options.feedUrl });
    } catch (err) {
      logger.warn("setFeedURL failed:", err);
    }
  }

  autoUpdater.on("checking-for-update", () => emit({ state: "checking" }));
  autoUpdater.on("update-available", (info) => {
    const releaseUrl =
      typeof (info as { releaseNotes?: unknown }).releaseNotes === "string"
        ? null
        : null;
    emit({ state: "available", version: info.version ?? "unknown", releaseUrl });
  });
  autoUpdater.on("update-not-available", () => emit({ state: "not-available" }));
  autoUpdater.on("download-progress", (progress) => {
    emit({ state: "downloading", percent: Math.round(progress.percent ?? 0) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    emit({ state: "downloaded", version: info.version ?? "unknown" });
  });
  autoUpdater.on("error", (err) => emit({ state: "error", message: String(err) }));
}

export async function checkForUpdatesManual(): Promise<UpdateStatus> {
  try {
    await autoUpdater.checkForUpdates();
    return latest;
  } catch (err) {
    const message = String(err);
    emit({ state: "error", message });
    return { state: "error", message };
  }
}

export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    emit({ state: "error", message: String(err) });
  }
}

export function quitAndInstall(): void {
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    emit({ state: "error", message: String(err) });
  }
}

export async function openDownloadPage(): Promise<void> {
  await openExternalHttpUrl("https://github.com/tompignofind123-cyber/inkforge/releases/latest");
}
