import { ipcMain, type BrowserWindow } from "electron";
import { ipcChannels, ipcEventChannels, type MobileSyncStatus } from "@inkforge/shared";
import {
  getMobileSyncStatus,
  refreshMobileSyncPairingCode,
  revokeMobileSyncDevice,
  setMobileSyncAutoStart,
  startMobileSyncServer,
  stopMobileSyncServer,
} from "../services/mobile-sync-host";
import { subscribeMobileSyncCompleted } from "../services/mobile-sync-notifier";

const MOBILE_SYNC_STATUS: typeof ipcChannels.mobileSyncStatus = "mobile-sync:status";
const MOBILE_SYNC_START: typeof ipcChannels.mobileSyncStart = "mobile-sync:start";
const MOBILE_SYNC_STOP: typeof ipcChannels.mobileSyncStop = "mobile-sync:stop";
const MOBILE_SYNC_REFRESH_CODE: typeof ipcChannels.mobileSyncRefreshCode = "mobile-sync:refresh-code";
const MOBILE_SYNC_SET_AUTO_START: typeof ipcChannels.mobileSyncSetAutoStart = "mobile-sync:set-auto-start";
const MOBILE_SYNC_REVOKE_DEVICE: typeof ipcChannels.mobileSyncRevokeDevice = "mobile-sync:revoke-device";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid mobile sync request");
  return value as Record<string, unknown>;
}

let unsubscribeMobileSyncCompleted: (() => void) | null = null;
export function registerMobileSyncHandlers(getWindow: () => BrowserWindow | null): void {
  unsubscribeMobileSyncCompleted?.();
  unsubscribeMobileSyncCompleted = subscribeMobileSyncCompleted(event => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(ipcEventChannels.mobileSyncCompleted, event);
  });
  ipcMain.handle(MOBILE_SYNC_STATUS, async (): Promise<MobileSyncStatus> => getMobileSyncStatus());
  ipcMain.handle(MOBILE_SYNC_START, async (): Promise<MobileSyncStatus> => startMobileSyncServer());
  ipcMain.handle(MOBILE_SYNC_STOP, async (): Promise<MobileSyncStatus> => stopMobileSyncServer());
  ipcMain.handle(MOBILE_SYNC_REFRESH_CODE, async (): Promise<MobileSyncStatus> => refreshMobileSyncPairingCode());
  ipcMain.handle(MOBILE_SYNC_SET_AUTO_START, async (_event, input: unknown) => {
    const parsed = record(input);
    if (typeof parsed.enabled !== "boolean") throw new Error("Auto-start must be boolean");
    return setMobileSyncAutoStart(parsed.enabled);
  });
  ipcMain.handle(MOBILE_SYNC_REVOKE_DEVICE, async (_event, input: unknown): Promise<MobileSyncStatus> => {
    const parsed = record(input);
    if (typeof parsed.deviceId !== "string" || parsed.deviceId.length > 128) throw new Error("Device id is invalid");
    return revokeMobileSyncDevice(parsed.deviceId);
  });
}
