import { ipcMain, type BrowserWindow } from "electron";
import type {
  DailySummaryGenerateResponse,
  DailySummaryRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  getDailySummaryRecord,
  listDailySummaryRecords,
  startDailySummary,
} from "../services/daily-summary-service";
import {
  parseDailySummaryGenerateInput,
  parseDailySummaryGetInput,
  parseDailySummaryListInput,
} from "./validation";

const DAILY_SUMMARY_GENERATE: typeof ipcChannels.dailySummaryGenerate = "daily:summary-generate";
const DAILY_SUMMARY_GET: typeof ipcChannels.dailySummaryGet = "daily:summary-get";
const DAILY_SUMMARY_LIST: typeof ipcChannels.dailySummaryList = "daily:summary-list";

export function registerDailySummaryHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    DAILY_SUMMARY_GENERATE,
    async (_event, input: unknown): Promise<DailySummaryGenerateResponse> =>
      startDailySummary(parseDailySummaryGenerateInput(input), getWindow()),
  );
  ipcMain.handle(
    DAILY_SUMMARY_GET,
    async (_event, input: unknown): Promise<DailySummaryRecord | null> =>
      getDailySummaryRecord(parseDailySummaryGetInput(input)),
  );
  ipcMain.handle(
    DAILY_SUMMARY_LIST,
    async (_event, input: unknown): Promise<DailySummaryRecord[]> =>
      listDailySummaryRecords(parseDailySummaryListInput(input)),
  );
}
