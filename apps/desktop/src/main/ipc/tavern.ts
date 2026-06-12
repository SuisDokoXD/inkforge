import { ipcMain, type BrowserWindow } from "electron";
import type {
  CompactResult,
  TavernDirectorPostResponse,
  TavernMessageRecord,
  TavernRoundRunResponse,
  TavernRoundStopResponse,
  TavernSessionRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  createTavernSession,
  deleteTavernSessionRecord,
  getTavernSession,
  listTavernMessagesForSession,
  listTavernSessionsByProject,
  postDirectorMessage,
} from "../services/tavern-session-service";
import {
  startTavernRound,
  stopTavernRound,
} from "../services/tavern-round-service";
import { compactTavernHistory } from "../services/tavern-summary-service";
import {
  parseTavernDirectorPostInput,
  parseTavernMessageListInput,
  parseTavernRoundRunInput,
  parseTavernRoundStopInput,
  parseTavernSessionCreateInput,
  parseTavernSessionDeleteInput,
  parseTavernSessionGetInput,
  parseTavernSessionListInput,
  parseTavernSummaryCompactInput,
} from "./validation";

const TAVERN_SESSION_CREATE: typeof ipcChannels.tavernSessionCreate = "tavern-session:create";
const TAVERN_SESSION_GET: typeof ipcChannels.tavernSessionGet = "tavern-session:get";
const TAVERN_SESSION_LIST: typeof ipcChannels.tavernSessionList = "tavern-session:list";
const TAVERN_SESSION_DELETE: typeof ipcChannels.tavernSessionDelete = "tavern-session:delete";
const TAVERN_MESSAGE_LIST: typeof ipcChannels.tavernMessageList = "tavern-message:list";
const TAVERN_DIRECTOR_POST: typeof ipcChannels.tavernDirectorPost = "tavern-director:post";
const TAVERN_ROUND_RUN: typeof ipcChannels.tavernRoundRun = "tavern-round:run";
const TAVERN_ROUND_STOP: typeof ipcChannels.tavernRoundStop = "tavern-round:stop";
const TAVERN_SUMMARY_COMPACT: typeof ipcChannels.tavernSummaryCompact = "tavern-summary:compact";

export function registerTavernHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    TAVERN_SESSION_CREATE,
    async (_event, input: unknown): Promise<TavernSessionRecord> => {
      return createTavernSession(parseTavernSessionCreateInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_SESSION_GET,
    async (_event, input: unknown): Promise<TavernSessionRecord | null> => {
      return getTavernSession(parseTavernSessionGetInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_SESSION_LIST,
    async (_event, input: unknown): Promise<TavernSessionRecord[]> => {
      return listTavernSessionsByProject(parseTavernSessionListInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_SESSION_DELETE,
    async (_event, input: unknown): Promise<{ sessionId: string }> => {
      return deleteTavernSessionRecord(parseTavernSessionDeleteInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_MESSAGE_LIST,
    async (_event, input: unknown): Promise<TavernMessageRecord[]> => {
      return listTavernMessagesForSession(parseTavernMessageListInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_DIRECTOR_POST,
    async (_event, input: unknown): Promise<TavernDirectorPostResponse> => {
      return postDirectorMessage(parseTavernDirectorPostInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_ROUND_RUN,
    async (_event, input: unknown): Promise<TavernRoundRunResponse> => {
      return startTavernRound(parseTavernRoundRunInput(input), getWindow());
    },
  );
  ipcMain.handle(
    TAVERN_ROUND_STOP,
    async (_event, input: unknown): Promise<TavernRoundStopResponse> => {
      return stopTavernRound(parseTavernRoundStopInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_SUMMARY_COMPACT,
    async (_event, input: unknown): Promise<CompactResult> => {
      return compactTavernHistory(parseTavernSummaryCompactInput(input));
    },
  );
}
