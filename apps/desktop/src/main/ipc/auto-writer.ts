import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ipcChannels,
  type AutoWriterCorrectResponse,
  type AutoWriterRunRecord,
  type AutoWriterStartResponse,
  type AutoWriterStopResponse,
} from "@inkforge/shared";
import {
  correctSegment,
  getAutoWriterRunRecord,
  injectIdea,
  listAutoWriterRuns,
  pauseAutoWriter,
  resumeAutoWriter,
  startAutoWriter,
  stopAutoWriter,
} from "../services/auto-writer-service";
import {
  parseAutoWriterCorrectInput,
  parseAutoWriterGetRunInput,
  parseAutoWriterInjectIdeaInput,
  parseAutoWriterListRunsInput,
  parseAutoWriterPauseInput,
  parseAutoWriterResumeInput,
  parseAutoWriterStartInput,
  parseAutoWriterStopInput,
} from "./validation";

const AW_START: typeof ipcChannels.autoWriterStart = "auto-writer:start";
const AW_STOP: typeof ipcChannels.autoWriterStop = "auto-writer:stop";
const AW_PAUSE: typeof ipcChannels.autoWriterPause = "auto-writer:pause";
const AW_RESUME: typeof ipcChannels.autoWriterResume = "auto-writer:resume";
const AW_GET: typeof ipcChannels.autoWriterGetRun = "auto-writer:get-run";
const AW_LIST: typeof ipcChannels.autoWriterListRuns = "auto-writer:list-runs";
const AW_INJECT: typeof ipcChannels.autoWriterInjectIdea = "auto-writer:inject-idea";
const AW_CORRECT: typeof ipcChannels.autoWriterCorrect = "auto-writer:correct";

export function registerAutoWriterHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    AW_START,
    async (_event, input: unknown): Promise<AutoWriterStartResponse> => {
      const { runId } = await startAutoWriter(parseAutoWriterStartInput(input), getWindow);
      return { runId, status: "started" };
    },
  );

  ipcMain.handle(
    AW_STOP,
    async (_event, input: unknown): Promise<AutoWriterStopResponse> => {
      const parsed = parseAutoWriterStopInput(input);
      stopAutoWriter(parsed.runId);
      return { runId: parsed.runId, stopped: true };
    },
  );

  ipcMain.handle(
    AW_PAUSE,
    async (_event, input: unknown): Promise<AutoWriterRunRecord> => {
      return pauseAutoWriter(parseAutoWriterPauseInput(input).runId);
    },
  );

  ipcMain.handle(
    AW_RESUME,
    async (_event, input: unknown): Promise<AutoWriterRunRecord> => {
      return resumeAutoWriter(parseAutoWriterResumeInput(input).runId);
    },
  );

  ipcMain.handle(
    AW_GET,
    async (_event, input: unknown): Promise<AutoWriterRunRecord | null> => {
      return getAutoWriterRunRecord(parseAutoWriterGetRunInput(input).runId);
    },
  );

  ipcMain.handle(
    AW_LIST,
    async (_event, input: unknown): Promise<AutoWriterRunRecord[]> => {
      return listAutoWriterRuns(parseAutoWriterListRunsInput(input));
    },
  );

  ipcMain.handle(
    AW_INJECT,
    async (_event, input: unknown): Promise<AutoWriterRunRecord> => {
      return injectIdea(parseAutoWriterInjectIdeaInput(input));
    },
  );

  ipcMain.handle(
    AW_CORRECT,
    async (_event, input: unknown): Promise<AutoWriterCorrectResponse> => {
      const parsed = parseAutoWriterCorrectInput(input);
      const { run, correction } = correctSegment(parsed);
      return { runId: parsed.runId, correction, run };
    },
  );
}
