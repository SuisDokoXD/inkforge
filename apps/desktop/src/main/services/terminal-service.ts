import { randomUUID } from "crypto";
import * as os from "os";
import type { BrowserWindow } from "electron";
import type * as NodePty from "node-pty";
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSpawnInput,
  TerminalSpawnResponse,
  ipcEventChannels,
} from "@inkforge/shared";
import { logger } from "./logger";

const TERMINAL_DATA: typeof ipcEventChannels.terminalData = "terminal:data";
const TERMINAL_EXIT: typeof ipcEventChannels.terminalExit = "terminal:exit";

interface Session {
  id: string;
  pty: NodePty.IPty;
  shell: string;
  cwd: string;
}

const sessions: Map<string, Session> = new Map();
let ptyModule: typeof NodePty | null = null;
let ptyLoadError: Error | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadPty(): typeof NodePty {
  if (ptyModule) return ptyModule;
  if (ptyLoadError) throw ptyLoadError;
  // Lazy load — avoid crashing main if native module has issues until terminal is used.
  try {
    ptyModule = require("node-pty") as typeof NodePty;
  } catch (error) {
    logger.warn("node-pty failed to load", error);
    ptyLoadError = new Error("当前版本未启用内嵌终端。");
    throw ptyLoadError;
  }
  return ptyModule;
}

function resolveShell(override?: string): string {
  if (override && override.trim()) return override;
  if (process.platform === "win32") {
    return process.env.ComSpec || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function resolveCwd(override?: string): string {
  if (override && override.trim()) return override;
  return process.env.USERPROFILE || process.env.HOME || os.homedir();
}

export function spawnSession(
  input: TerminalSpawnInput,
  getWindow: () => BrowserWindow | null,
): TerminalSpawnResponse {
  const pty = loadPty();
  const id = randomUUID();
  const shell = resolveShell(input.shell);
  const cwd = resolveCwd(input.cwd);
  const cols = Math.max(20, Math.min(400, input.cols ?? 80));
  const rows = Math.max(5, Math.min(200, input.rows ?? 24));

  let proc: NodePty.IPty;
  try {
    proc = pty.spawn(shell, [], {
      name: "xterm-color",
      cols,
      rows,
      cwd,
      env: process.env as { [key: string]: string },
    });
  } catch (error) {
    logger.warn("terminal spawn failed", error);
    throw new Error(`Terminal unavailable: ${errorMessage(error)}`);
  }

  proc.onData((data: string) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const payload: TerminalDataEvent = { id, data };
    win.webContents.send(TERMINAL_DATA, payload);
  });

  proc.onExit(({ exitCode, signal }) => {
    sessions.delete(id);
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const payload: TerminalExitEvent = { id, exitCode, signal };
    win.webContents.send(TERMINAL_EXIT, payload);
  });

  sessions.set(id, { id, pty: proc, shell, cwd });
  logger.info(`terminal spawned id=${id} shell=${shell}`);
  return { id, shell, cwd };
}

export function writeInput(id: string, data: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.pty.write(data);
}

export function resize(id: string, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (!s) return;
  const c = Math.max(20, Math.min(400, cols));
  const r = Math.max(5, Math.min(200, rows));
  try {
    s.pty.resize(c, r);
  } catch (error) {
    logger.warn("terminal resize failed", error);
  }
}

export function dispose(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.pty.kill();
  } catch (error) {
    logger.warn("terminal kill failed", error);
  }
  sessions.delete(id);
}

export function disposeAll(): void {
  for (const id of sessions.keys()) dispose(id);
}
