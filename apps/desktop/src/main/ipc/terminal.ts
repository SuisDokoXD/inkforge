import { ipcMain, type BrowserWindow } from "electron";
import { getAppSettings } from "@inkforge/storage";
import type {
  TerminalSpawnResponse,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { assertTerminalDevModeEnabled } from "../services/terminal-access";
import { dispose, resize, spawnSession, writeInput } from "../services/terminal-service";
import {
  parseTerminalDisposePayload,
  parseTerminalInputPayload,
  parseTerminalResizePayload,
  parseTerminalSpawnInput,
} from "./validation";

const TERMINAL_SPAWN: typeof ipcChannels.terminalSpawn = "terminal:spawn";
const TERMINAL_INPUT: typeof ipcChannels.terminalInput = "terminal:input";
const TERMINAL_RESIZE: typeof ipcChannels.terminalResize = "terminal:resize";
const TERMINAL_DISPOSE: typeof ipcChannels.terminalDispose = "terminal:dispose";

function requireTerminalDevMode(): void {
  const ctx = getAppContext();
  assertTerminalDevModeEnabled(getAppSettings(ctx.db).devModeEnabled);
}

export function registerTerminalHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    TERMINAL_SPAWN,
    async (_event, payload: unknown): Promise<TerminalSpawnResponse> => {
      requireTerminalDevMode();
      return spawnSession(parseTerminalSpawnInput(payload), getWindow);
    },
  );
  ipcMain.handle(
    TERMINAL_INPUT,
    async (_event, payload: unknown): Promise<{ ok: true }> => {
      requireTerminalDevMode();
      const input = parseTerminalInputPayload(payload);
      writeInput(input.id, input.data);
      return { ok: true };
    },
  );
  ipcMain.handle(
    TERMINAL_RESIZE,
    async (_event, payload: unknown): Promise<{ ok: true }> => {
      const input = parseTerminalResizePayload(payload);
      resize(input.id, input.cols, input.rows);
      return { ok: true };
    },
  );
  ipcMain.handle(
    TERMINAL_DISPOSE,
    async (_event, payload: unknown): Promise<{ ok: true }> => {
      const input = parseTerminalDisposePayload(payload);
      dispose(input.id);
      return { ok: true };
    },
  );
}
