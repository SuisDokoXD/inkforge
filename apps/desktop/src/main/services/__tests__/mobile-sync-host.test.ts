import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  config: null as null | {
    workspaceDir: string | null;
    uiLanguage: "zh";
    analysisEnabled: boolean;
    analysisThreshold: number;
    mobileSyncAutoStart: boolean;
    mobileSyncServeOwned: boolean;
    mobileSyncServePort: number | null;
    mobileSyncDevices: Array<{ id: string; name: string; tokenHash: string; pairedAt: string; lastSync?: unknown }>;
  },
  serveProxy: null as string | null,
  funnelStatus: {} as unknown,
  delayServeStart: false,
  commands: [] as string[][],
  syncResult: null as unknown,
}));

vi.mock("node:child_process", () => ({
  execFile: (_executable: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    testState.commands.push([...args]);
    if (args[0] === "status") {
      callback(null, JSON.stringify({
        Self: { Online: true, DNSName: "sync-test.tail123.ts.net.", TailscaleIPs: ["100.100.1.2"] },
      }), "");
      return {};
    }
    if (args[0] === "funnel" && args[1] === "status") {
      callback(null, JSON.stringify(testState.funnelStatus), "");
      return {};
    }
    if (args[0] === "serve" && args[1] === "status") {
      const json = testState.serveProxy
        ? { Web: { "https://sync-test.tail123.ts.net": { Handlers: { "/inkforge": { Proxy: testState.serveProxy } } } } }
        : {};
      callback(null, JSON.stringify(json), "");
      return {};
    }
    if (args[0] === "serve" && args.includes("off")) {
      testState.serveProxy = null;
      callback(null, "", "");
      return {};
    }
    if (args[0] === "serve") {
      const finish = () => {
        testState.serveProxy = args[args.length - 1];
        callback(null, "", "");
      };
      if (testState.delayServeStart) setTimeout(finish, 30);
      else finish();
      return {};
    }
    callback(new Error("unexpected tailscale command"), "", "");
    return {};
  },
}));

vi.mock("../mobile-sync-workspace", () => ({
  parseMobileSyncRequest: (value: unknown) => value,
  syncMobileWorkspace: async () => testState.syncResult,
}));

vi.mock("../app-state", () => ({
  getAppContext: () => ({
    workspaceDir: testState.config?.workspaceDir ?? "",
    userDataDir: "",
    config: testState.config,
    db: null,
    keystore: null,
  }),
  updateWorkspaceConfig: (partial: Record<string, unknown>) => {
    if (!testState.config) throw new Error("missing test config");
    Object.assign(testState.config, partial);
    return testState.config;
  },
}));

import {
  hasEnabledFunnelOnPort,
  getMobileSyncStatus,
  startMobileSyncServer,
  stopMobileSyncServer,
} from "../mobile-sync-host";
import { subscribeMobileSyncCompleted } from "../mobile-sync-notifier";

const LOOPBACK_PROXY = /^http:\/\/127\.0\.0\.1:(\d+)$/;

beforeEach(() => {
  testState.config = {
    workspaceDir: null,
    uiLanguage: "zh",
    analysisEnabled: true,
    analysisThreshold: 200,
    mobileSyncAutoStart: false,
    mobileSyncServeOwned: false,
    mobileSyncServePort: null,
    mobileSyncDevices: [],
  };
  testState.serveProxy = null;
  testState.funnelStatus = {};
  testState.delayServeStart = false;
  testState.commands.length = 0;
  testState.syncResult = null;
});

afterEach(async () => {
  await stopMobileSyncServer().catch(() => undefined);
  testState.config = null;
  testState.serveProxy = null;
});

describe("mobile sync host HTTP lifecycle", () => {
  it("refuses to start the sync mount when Funnel is active on HTTPS 443", async () => {
    testState.funnelStatus = { AllowFunnel: { "sync-test.tail123.ts.net:443": true } };
    expect(hasEnabledFunnelOnPort(testState.funnelStatus, 443)).toBe(true);
    expect(hasEnabledFunnelOnPort({ AllowFunnel: { "sync-test.tail123.ts.net:8443": true } }, 443)).toBe(false);
    await expect(startMobileSyncServer()).rejects.toThrow(/Funnel.*443/);
    expect(testState.commands.some(args => args[0] === "serve" && args.includes("--bg"))).toBe(false);
    expect(testState.serveProxy).toBeNull();
  });

  it("serializes stop behind an in-flight Serve start", async () => {
    testState.delayServeStart = true;
    const starting = startMobileSyncServer();
    const stopping = stopMobileSyncServer();
    const [started, stopped] = await Promise.all([starting, stopping]);
    expect(started.running).toBe(true);
    expect(stopped.running).toBe(false);
    expect(testState.serveProxy).toBeNull();
    expect(testState.config?.mobileSyncServeOwned).toBe(false);
  });

  it("pairs once over the local server, enforces origin/auth checks, revokes the token and removes only its Serve path", async () => {
    const status = await startMobileSyncServer();
    expect(status.running).toBe(true);
    expect(status.endpoint).toBe("https://sync-test.tail123.ts.net/inkforge");
    expect(status.pairingCode).toMatch(/^\d{6}$/);
    const serveStart = testState.commands.find(args => args[0] === "serve" && args.includes("--bg"));
    expect(serveStart).toBeDefined();
    const target = serveStart?.[serveStart.length - 1] ?? "";
    const match = LOOPBACK_PROXY.exec(target);
    expect(match).not.toBeNull();
    const localOrigin = `http://127.0.0.1:${match![1]}`;

    const denied = await fetch(`${localOrigin}/inkforge/api/v1/pair`, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ code: status.pairingCode, deviceName: "bad" }),
    });
    expect(denied.status).toBe(403);

    const pairedResponse = await fetch(`${localOrigin}/inkforge/api/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: status.pairingCode, deviceName: "InkForge Android" }),
    });
    expect(pairedResponse.status).toBe(200);
    const paired = await pairedResponse.json() as { deviceId: string; token: string };
    expect(paired.token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(getMobileSyncStatus().devices).toHaveLength(1);
    expect(testState.config?.mobileSyncDevices[0].tokenHash).not.toBe(paired.token);

    const unauthorized = await fetch(`${localOrigin}/inkforge/api/v1/unpair`, { method: "POST" });
    expect(unauthorized.status).toBe(401);
    const revoked = await fetch(`${localOrigin}/inkforge/api/v1/unpair`, {
      method: "POST",
      headers: { authorization: `Bearer ${paired.token}` },
    });
    expect(revoked.status).toBe(200);
    expect(getMobileSyncStatus().devices).toHaveLength(0);
    expect(testState.config?.mobileSyncDevices).toHaveLength(0);

    const stopped = await stopMobileSyncServer();
    expect(stopped.running).toBe(false);
    expect(testState.serveProxy).toBeNull();
    expect(testState.commands.some(args => args.join(" ") === "serve --https=443 --set-path=/inkforge off")).toBe(true);
  });
  it("publishes a desktop refresh summary after the paired device sync commits", async () => {
    const status = await startMobileSyncServer();
    const serveStart = testState.commands.find(args => args[0] === "serve" && args.includes("--bg"));
    const target = serveStart?.[serveStart.length - 1] ?? "";
    const match = LOOPBACK_PROXY.exec(target);
    expect(match).not.toBeNull();
    const localOrigin = `http://127.0.0.1:${match![1]}`;
    const pairResponse = await fetch(`${localOrigin}/inkforge/api/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: status.pairingCode, deviceName: "InkForge Android" }),
    });
    const paired = await pairResponse.json() as { deviceId: string; token: string };
    expect(getMobileSyncStatus().devices[0].lastSync).toBeNull();
    const result = {
      snapshot: { projects: [{ id: "book-1" }], chapters: [{ deleted: false }, { deleted: true }] },
      conflicts: [{ kind: "chapter", id: "chapter-1", title: "第一章", copyId: "copy-1" }],
      syncedAt: "2026-10-16T17:00:00.000Z",
    };
    testState.syncResult = result;
    const listener = vi.fn();
    const unsubscribe = subscribeMobileSyncCompleted(listener);
    try {
      const response = await fetch(`${localOrigin}/inkforge/api/v1/sync`, {
        method: "POST",
        headers: { authorization: `Bearer ${paired.token}`, "content-type": "application/json" },
        body: JSON.stringify({ format: "inkforge.mobile-sync", version: 1, deviceId: paired.deviceId }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(result);
      expect(listener).toHaveBeenCalledWith({
        deviceName: "InkForge Android",
        projectCount: 1,
        chapterCount: 1,
        conflictCount: 1,
        syncedAt: result.syncedAt,
      });
      const summary = {
        syncedAt: result.syncedAt,
        projectCount: 1,
        chapterCount: 1,
        conflictCount: 1,
      };
      expect(getMobileSyncStatus().devices[0].lastSync).toEqual(summary);
      expect(testState.config?.mobileSyncDevices[0].lastSync).toEqual(summary);
    } finally { unsubscribe(); }
  });
});
