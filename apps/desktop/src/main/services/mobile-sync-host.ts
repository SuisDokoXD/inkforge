import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import type { MobileSyncDeviceLastSync, MobileSyncStatus } from "@inkforge/shared";
import type { MobileSyncDeviceConfig } from "@inkforge/storage";
import { publishMobileSyncCompleted } from "./mobile-sync-notifier";
import { getAppContext, updateWorkspaceConfig } from "./app-state";
import { parseMobileSyncRequest, syncMobileWorkspace } from "./mobile-sync-workspace";

const SERVE_PATH = "/inkforge";
const SERVE_HTTPS_PORT = 443;
const API_PREFIX = "/api/v1";
const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 5;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_PAIRED_DEVICES = 10;
const ALLOWED_ORIGINS = new Set(["https://localhost", "http://localhost", "capacitor://localhost"]);

interface TailscaleSelf {
  Online?: boolean;
  DNSName?: string;
  TailscaleIPs?: string[];
}

interface ServePathEntry {
  found: boolean;
  proxy?: string;
}

interface HostSession {
  server: Server;
  endpoint: string;
  localPort: number;
  code: string;
  codeExpiresAt: number;
  pairAttempts: number;
}

let session: HostSession | null = null;
let lifecycleQueue: Promise<void> = Promise.resolve();

function serializeLifecycle<T>(work: () => Promise<T>): Promise<T> {
  const operation = lifecycleQueue.then(work, work);
  lifecycleQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function resolveTailscaleExecutable(): string {
  const override = process.env.INKFORGE_TAILSCALE_CLI;
  if (override) return override;
  if (process.platform === "win32") {
    const candidates = [
      process.env.ProgramFiles && `${process.env.ProgramFiles}\\Tailscale\\tailscale.exe`,
      process.env["ProgramFiles(x86)"] && `${process.env["ProgramFiles(x86)"]}\\Tailscale\\tailscale.exe`,
      "C:\\Program Files\\Tailscale\\tailscale.exe",
    ].filter((value): value is string => !!value);
    const found = candidates.find(candidate => fs.existsSync(candidate));
    if (found) return found;
    return "tailscale.exe";
  }
  return "tailscale";
}

function runTailscale(args: string[], timeout = 12_000): Promise<string> {
  const executable = resolveTailscaleExecutable();
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim().slice(0, 400);
        reject(new Error(`Tailscale 命令失败：${detail}`));
        return;
      }
      resolve(String(stdout));
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return `/${trimmed.replace(/\/+$/, "")}`;
  return trimmed.replace(/\/+$/, "") || "/";
}

export function findServePathEntry(value: unknown, requestedPath = SERVE_PATH): ServePathEntry | null {
  if (!isRecord(value)) return null;
  for (const key of ["Handlers", "handlers"]) {
    const handlers = value[key];
    if (!isRecord(handlers)) continue;
    for (const [mount, handler] of Object.entries(handlers)) {
      if (normalizePath(mount) !== normalizePath(requestedPath)) continue;
      if (!isRecord(handler)) return { found: true };
      const proxy = typeof handler.Proxy === "string" ? handler.Proxy
        : typeof handler.proxy === "string" ? handler.proxy : undefined;
      return { found: true, proxy };
    }
  }
  for (const child of Object.values(value)) {
    const found = findServePathEntry(child, requestedPath);
    if (found) return found;
  }
  return null;
}

export function tailscaleServeStartArgs(port: number): string[] {
  return ["serve", "--bg", "--yes", `--https=${SERVE_HTTPS_PORT}`, `--set-path=${SERVE_PATH}`, `http://127.0.0.1:${port}`];
}

export function tailscaleServeStopArgs(): string[] {
  // Tailscale's `off` command removes this mount only; never use `serve reset`.
  return ["serve", `--https=${SERVE_HTTPS_PORT}`, `--set-path=${SERVE_PATH}`, "off"];
}

async function readTailscaleSelf(): Promise<{ endpoint: string; self: TailscaleSelf }> {
  let status: unknown;
  try {
    status = JSON.parse(await runTailscale(["status", "--json"]));
  } catch (error) {
    throw new Error(`无法读取 Tailscale 状态。请确认 Tailscale 已安装并登录。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
  if (!isRecord(status) || !isRecord(status.Self)) throw new Error("Tailscale 尚未连接到 Tailnet。");
  const self = status.Self as TailscaleSelf;
  const dnsName = typeof self.DNSName === "string" ? self.DNSName.replace(/\.$/, "") : "";
  if (self.Online !== true || !dnsName) throw new Error("Tailscale 当前离线或未启用 MagicDNS。");
  if (!dnsName.toLowerCase().endsWith(".ts.net")) throw new Error("未检测到 Tailscale HTTPS 域名（*.ts.net）。");
  if (!Array.isArray(self.TailscaleIPs) || !self.TailscaleIPs.some(ip => typeof ip === "string" && isTailnetIPv4(ip))) {
    throw new Error("未检测到本机的 Tailscale IPv4 地址。");
  }
  return { endpoint: `https://${dnsName}${SERVE_PATH}`, self };
}

function isTailnetIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

async function readServeStatus(): Promise<{ raw: string; json: unknown }> {
  const raw = await runTailscale(["serve", "status", "--json"]);
  try {
    return { raw, json: JSON.parse(raw) as unknown };
  } catch {
    throw new Error("无法安全识别现有 Tailscale Serve 配置；为避免覆盖其他路由，本次未启用同步。");
  }
}
export function hasEnabledFunnelOnPort(config: unknown, port: number): boolean {
  if (!isRecord(config)) return false;
  const allowFunnel = config.AllowFunnel;
  if (isRecord(allowFunnel)) {
    for (const [hostPort, enabled] of Object.entries(allowFunnel)) {
      const portText = hostPort.slice(hostPort.lastIndexOf(":") + 1);
      if (enabled === true && Number(portText) === port) return true;
    }
  }
  return Object.values(config).some(value => isRecord(value) && hasEnabledFunnelOnPort(value, port));
}

async function readFunnelStatus(): Promise<unknown> {
  try { return JSON.parse(await runTailscale(["funnel", "status", "--json"])) as unknown; }
  catch { throw new Error("无法确认 Tailscale Funnel 公网状态；为确保同步仅限 Tailnet，本次未启动。"); }
}


function isOwnedServeProxy(proxy: string | undefined, port: number | null): boolean {
  return !!proxy && port !== null && proxy.replace(/\/$/, "") === `http://127.0.0.1:${port}`;
}

function randomPairCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

function publicDevices(): MobileSyncStatus["devices"] {
  return getAppContext().config.mobileSyncDevices.map(({ id, name, pairedAt, lastSync }) => ({
    id,
    name,
    pairedAt,
    lastSync: lastSync ?? null,
  }));
}

/** Persist the summary on the paired device so the desktop can report the last sync after a restart. */
function recordMobileSyncSummary(deviceId: string, summary: MobileSyncDeviceLastSync): void {
  const config = getAppContext().config;
  try {
    updateWorkspaceConfig({
      mobileSyncDevices: config.mobileSyncDevices.map(device =>
        device.id === deviceId ? { ...device, lastSync: summary } : device),
    });
  } catch {
    // Reporting metadata must never turn an already-committed sync into an HTTP failure.
  }
}

export function getMobileSyncStatus(): MobileSyncStatus {
  const config = getAppContext().config;
  const active = session;
  const codeIsValid = active !== null && Date.now() < active.codeExpiresAt && active.pairAttempts < MAX_PAIR_ATTEMPTS && !!active.code;
  return {
    running: active !== null,
    endpoint: active?.endpoint ?? null,
    pairingCode: codeIsValid ? active.code : null,
    pairingCodeExpiresAt: codeIsValid ? active.codeExpiresAt : null,
    autoStart: config.mobileSyncAutoStart,
    devices: publicDevices(),
  };
}

function listenLoopback(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void handleApiRequest(request, response).catch((failure: unknown) => {
        if (response.headersSent) { response.destroy(); return; }
        const code = isRecord(failure) && typeof failure.statusCode === "number" ? failure.statusCode : 500;
        const status = code === 400 || code === 413 ? code : 500;
        const message = status !== 500 && failure instanceof Error ? failure.message : "同步服务内部错误。";
        sendJson(response, status, { error: message });
      });
    });
    server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法确定同步服务的本机端口"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close(error => error ? reject(error) : resolve());
  });
}

export function startMobileSyncServer(): Promise<MobileSyncStatus> {
  return serializeLifecycle(async () => session ? getMobileSyncStatus() : startMobileSyncServerInternal());
}

async function startMobileSyncServerInternal(): Promise<MobileSyncStatus> {
  const { endpoint } = await readTailscaleSelf();
  const ctx = getAppContext();
  const funnelStatus = await readFunnelStatus();
  if (hasEnabledFunnelOnPort(funnelStatus, SERVE_HTTPS_PORT)) {
    throw new Error("检测到 Tailscale Funnel 正在公开 443 端口；为保护书稿，请先关闭 Funnel。InkForge 不会修改现有公网路由。");
  }
  const serveStatus = await readServeStatus();
  if (hasEnabledFunnelOnPort(serveStatus.json, SERVE_HTTPS_PORT)) {
    throw new Error("Serve 配置中检测到 443 端口 Funnel 标记；为保护书稿，同步服务未启动。");
  }
  const existingRoute = findServePathEntry(serveStatus.json);
  if (existingRoute && !isOwnedServeProxy(existingRoute.proxy, ctx.config.mobileSyncServePort)) {
    throw new Error("Tailscale Serve 的 /inkforge 路径已被其他配置占用；未修改现有路由。");
  }
  if (existingRoute && !ctx.config.mobileSyncServeOwned) {
    throw new Error("检测到现存 /inkforge Serve 路由，但它不是由 InkForge 创建；未覆盖该路由。");
  }

  const local = await listenLoopback();
  let routeConfigured = false;
  try {
    await runTailscale(tailscaleServeStartArgs(local.port));
    routeConfigured = true;
    updateWorkspaceConfig({ mobileSyncServeOwned: true, mobileSyncServePort: local.port });
    session = {
      server: local.server,
      endpoint,
      localPort: local.port,
      code: randomPairCode(),
      codeExpiresAt: Date.now() + PAIR_CODE_TTL_MS,
      pairAttempts: 0,
    };
    return getMobileSyncStatus();
  } catch (error) {
    await closeHttpServer(local.server).catch(() => undefined);
    if (routeConfigured) {
      await runTailscale(tailscaleServeStopArgs()).catch(() => undefined);
      updateWorkspaceConfig({ mobileSyncServeOwned: false, mobileSyncServePort: null });
    }
    throw error;
  }
}

export function stopMobileSyncServer(): Promise<MobileSyncStatus> {
  return serializeLifecycle(stopMobileSyncServerInternal);
}

async function stopMobileSyncServerInternal(): Promise<MobileSyncStatus> {
  const active = session;
  session = null;
  if (active) await closeHttpServer(active.server);

  const config = getAppContext().config;
  if (config.mobileSyncServeOwned) {
    const { json } = await readServeStatus();
    const route = findServePathEntry(json);
    if (route) {
      if (!isOwnedServeProxy(route.proxy, config.mobileSyncServePort)) {
        throw new Error("/inkforge 路由已被改动；为保护其他服务，InkForge 未移除该路由。");
      }
      await runTailscale(tailscaleServeStopArgs());
    }
    updateWorkspaceConfig({ mobileSyncServeOwned: false, mobileSyncServePort: null });
  }
  return getMobileSyncStatus();
}

export function refreshMobileSyncPairingCode(): MobileSyncStatus {
  if (!session) throw new Error("请先启动 Tailnet 同步服务");
  session.code = randomPairCode();
  session.codeExpiresAt = Date.now() + PAIR_CODE_TTL_MS;
  session.pairAttempts = 0;
  return getMobileSyncStatus();
}

export function setMobileSyncAutoStart(enabled: boolean): { enabled: boolean } {
  updateWorkspaceConfig({ mobileSyncAutoStart: enabled });
  return { enabled };
}

export function revokeMobileSyncDevice(deviceId: string): MobileSyncStatus {
  const config = getAppContext().config;
  updateWorkspaceConfig({ mobileSyncDevices: config.mobileSyncDevices.filter(device => device.id !== deviceId) });
  return getMobileSyncStatus();
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  response.end(data);
}

function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { error: "不允许此来源访问同步服务。" });
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  response.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function requestPath(request: IncomingMessage): string {
  let pathname = "/";
  try { pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; } catch { return "/"; }
  const prefix = `${SERVE_PATH}/`;
  if (pathname === SERVE_PATH) return "/";
  if (pathname.startsWith(prefix)) pathname = pathname.slice(SERVE_PATH.length);
  return pathname;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let overLimit = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) { overLimit = true; return; }
      chunks.push(buffer);
    });
    request.on("error", reject);
    request.on("end", () => {
      if (overLimit) { reject(Object.assign(new Error("同步数据超过 64 MB 限制"), { statusCode: 413 })); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown); }
      catch { reject(Object.assign(new Error("请求 JSON 无效"), { statusCode: 400 })); }
    });
  });
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function findPairedDevice(request: IncomingMessage): MobileSyncDeviceConfig | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const candidate = Buffer.from(tokenHash(token), "hex");
  let found: MobileSyncDeviceConfig | null = null;
  for (const device of getAppContext().config.mobileSyncDevices) {
    const expected = Buffer.from(device.tokenHash, "hex");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) found = device;
  }
  return found;
}

function validPairCode(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !/^\d{6}$/.test(provided) || !/^\d{6}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(provided, "ascii"), Buffer.from(expected, "ascii"));
}

async function handlePair(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!session) { sendJson(response, 503, { error: "桌面同步服务尚未启动。" }); return; }
  if (Date.now() >= session.codeExpiresAt || !session.code) { sendJson(response, 410, { error: "配对码已过期，请在桌面重新生成。" }); return; }
  if (session.pairAttempts >= MAX_PAIR_ATTEMPTS) { sendJson(response, 429, { error: "配对尝试次数过多，请刷新配对码。" }); return; }
  const body = await readJsonBody(request);
  if (!isRecord(body)) { sendJson(response, 400, { error: "配对信息无效。" }); return; }
  if (!validPairCode(body.code, session.code)) {
    session.pairAttempts += 1;
    if (session.pairAttempts >= MAX_PAIR_ATTEMPTS) session.code = "";
    sendJson(response, 401, { error: "配对码不正确。" });
    return;
  }

  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 60) : "";
  if (!deviceName) { sendJson(response, 400, { error: "请提供设备名称。" }); return; }
  const ctx = getAppContext();
  if (ctx.config.mobileSyncDevices.length >= MAX_PAIRED_DEVICES) {
    sendJson(response, 409, { error: "已达到配对设备上限，请先移除不再使用的设备。" });
    return;
  }
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const device: MobileSyncDeviceConfig = {
    id,
    name: deviceName,
    tokenHash: tokenHash(token),
    pairedAt: new Date().toISOString(),
  };
  updateWorkspaceConfig({ mobileSyncDevices: [...ctx.config.mobileSyncDevices, device] });
  session.code = "";
  session.codeExpiresAt = 0;
  sendJson(response, 200, { deviceId: id, token });
}

async function handleApiRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!applyCors(request, response)) return;
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const route = requestPath(request);
  if (request.method !== "POST") { sendJson(response, 405, { error: "只支持 POST 请求。" }); return; }

  if (route === `${API_PREFIX}/pair`) {
    await handlePair(request, response);
    return;
  }

  const device = findPairedDevice(request);
  if (!device) { sendJson(response, 401, { error: "设备未配对或凭据已撤销。" }); return; }
  if (route === `${API_PREFIX}/unpair`) {
    revokeMobileSyncDevice(device.id);
    sendJson(response, 200, { ok: true });
    return;
  }
  if (route === `${API_PREFIX}/sync`) {
    const body = await readJsonBody(request);
    try { parseMobileSyncRequest(body, device.id); }
    catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "同步数据无效。" });
      return;
    }
    try {
      const result = await syncMobileWorkspace(body, device.id);
      const summary: MobileSyncDeviceLastSync = {
        syncedAt: result.syncedAt,
        projectCount: result.snapshot.projects.length,
        chapterCount: result.snapshot.chapters.filter(chapter => !chapter.deleted).length,
        conflictCount: result.conflicts.length,
      };
      recordMobileSyncSummary(device.id, summary);
      publishMobileSyncCompleted({ deviceName: device.name, ...summary });
      sendJson(response, 200, result);
    } catch {
      sendJson(response, 500, { error: "桌面保存同步数据失败；请检查磁盘空间并重试。" });
    }
    return;
  }
  sendJson(response, 404, { error: "同步接口不存在。" });
}
