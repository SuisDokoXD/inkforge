import * as fs from "fs";
import * as path from "path";
import { coerceLang, type Lang } from "@inkforge/shared";

export interface MobileSyncDeviceLastSync {
  syncedAt: string;
  projectCount: number;
  chapterCount: number;
  conflictCount: number;
}

export interface MobileSyncDeviceConfig {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: string;
  /** Optional so configs written by earlier builds keep loading unchanged. */
  lastSync?: MobileSyncDeviceLastSync | null;
}

export interface WorkspaceConfig {
  workspaceDir: string | null;
  uiLanguage: Lang;
  analysisEnabled: boolean;
  analysisThreshold: number;
  mobileSyncAutoStart: boolean;
  mobileSyncServeOwned: boolean;
  mobileSyncServePort: number | null;
  mobileSyncDevices: MobileSyncDeviceConfig[];
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  workspaceDir: null,
  uiLanguage: "zh",
  analysisEnabled: true,
  analysisThreshold: 200,
  mobileSyncAutoStart: false,
  mobileSyncServeOwned: false,
  mobileSyncServePort: null,
  mobileSyncDevices: [],
};

function isMobileSyncDeviceConfig(value: unknown): value is MobileSyncDeviceConfig {
  if (!value || typeof value !== "object") return false;
  const device = value as Record<string, unknown>;
  return typeof device.id === "string" && device.id.length > 0
    && typeof device.name === "string" && device.name.length > 0
    && typeof device.tokenHash === "string" && /^[0-9a-f]{64}$/i.test(device.tokenHash)
    && typeof device.pairedAt === "string";
}

/** Malformed history must not discard an otherwise valid pairing; it degrades to "never synced". */
function coerceLastSync(value: unknown): MobileSyncDeviceLastSync | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const count = (input: unknown): number | null =>
    typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 1_000_000 ? input : null;
  const projectCount = count(raw.projectCount);
  const chapterCount = count(raw.chapterCount);
  const conflictCount = count(raw.conflictCount);
  if (typeof raw.syncedAt !== "string" || !raw.syncedAt || Number.isNaN(Date.parse(raw.syncedAt))) return null;
  if (projectCount === null || chapterCount === null || conflictCount === null) return null;
  return { syncedAt: raw.syncedAt, projectCount, chapterCount, conflictCount };
}

function normalizeDevice(value: MobileSyncDeviceConfig): MobileSyncDeviceConfig {
  return {
    id: value.id,
    name: value.name,
    tokenHash: value.tokenHash,
    pairedAt: value.pairedAt,
    lastSync: coerceLastSync(value.lastSync),
  };
}

export function loadWorkspaceConfig(userDataDir: string): WorkspaceConfig {
  const filePath = path.join(userDataDir, "config.json");
  if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG };
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const raw = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    const port = raw.mobileSyncServePort;
    const mobileSyncServePort = typeof port === "number" && Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      uiLanguage: coerceLang(raw.uiLanguage, DEFAULT_CONFIG.uiLanguage),
      mobileSyncAutoStart: raw.mobileSyncAutoStart === true,
      mobileSyncServeOwned: raw.mobileSyncServeOwned === true && mobileSyncServePort !== null,
      mobileSyncServePort,
      mobileSyncDevices: Array.isArray(raw.mobileSyncDevices)
        ? raw.mobileSyncDevices.filter(isMobileSyncDeviceConfig).map(normalizeDevice)
        : [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveWorkspaceConfig(userDataDir: string, config: WorkspaceConfig): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  const filePath = path.join(userDataDir, "config.json");
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}
