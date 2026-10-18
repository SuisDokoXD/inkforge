import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceConfig, saveWorkspaceConfig, type MobileSyncDeviceConfig } from "../workspace";

const TOKEN_HASH = "a".repeat(64);
let userDataDir: string;

function writeRawConfig(config: unknown): void {
  writeFileSync(join(userDataDir, "config.json"), JSON.stringify(config), "utf-8");
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "inkforge-workspace-config-"));
});

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

describe("mobile sync device history in workspace config", () => {
  it("keeps a valid last sync summary across save and load", () => {
    const lastSync = { syncedAt: "2026-10-18T10:00:00.000Z", projectCount: 3, chapterCount: 42, conflictCount: 1 };
    const device: MobileSyncDeviceConfig = {
      id: "device-1",
      name: "InkForge Android",
      tokenHash: TOKEN_HASH,
      pairedAt: "2026-10-01T00:00:00.000Z",
      lastSync,
    };
    saveWorkspaceConfig(userDataDir, { ...loadWorkspaceConfig(userDataDir), mobileSyncDevices: [device] });

    expect(loadWorkspaceConfig(userDataDir).mobileSyncDevices).toEqual([device]);
  });

  it("degrades malformed history to null instead of dropping the pairing", () => {
    writeRawConfig({
      mobileSyncDevices: [
        { id: "device-1", name: "手机", tokenHash: TOKEN_HASH, pairedAt: "2026-10-01T00:00:00.000Z", lastSync: { syncedAt: "not-a-date", projectCount: 1, chapterCount: 1, conflictCount: 0 } },
        { id: "device-2", name: "平板", tokenHash: TOKEN_HASH, pairedAt: "2026-10-02T00:00:00.000Z", lastSync: { syncedAt: "2026-10-03T00:00:00.000Z", projectCount: -1, chapterCount: 1, conflictCount: 0 } },
        { id: "device-3", name: "旧设备", tokenHash: TOKEN_HASH, pairedAt: "2026-10-04T00:00:00.000Z" },
      ],
    });

    const devices = loadWorkspaceConfig(userDataDir).mobileSyncDevices;
    expect(devices.map(device => device.id)).toEqual(["device-1", "device-2", "device-3"]);
    expect(devices.map(device => device.lastSync)).toEqual([null, null, null]);
  });

  it("drops devices that are not validly paired", () => {
    writeRawConfig({
      mobileSyncDevices: [
        { id: "device-1", name: "手机", tokenHash: "not-a-hash", pairedAt: "2026-10-01T00:00:00.000Z" },
        { id: "", name: "空编号", tokenHash: TOKEN_HASH, pairedAt: "2026-10-01T00:00:00.000Z" },
      ],
    });

    expect(loadWorkspaceConfig(userDataDir).mobileSyncDevices).toEqual([]);
  });
});
