import { ipcMain } from "electron";
import { getDailyProgress, getProject, todayKey } from "@inkforge/storage";
import type { DailyProgressRecord, ipcChannels } from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { parseDailyProgressInput } from "./validation";

const DAILY_PROGRESS: typeof ipcChannels.dailyProgress = "daily:progress";

export function registerDailyHandlers(): void {
  ipcMain.handle(DAILY_PROGRESS, async (_event, input: unknown): Promise<DailyProgressRecord> => {
    const parsed = parseDailyProgressInput(input);
    const ctx = getAppContext();
    const project = getProject(ctx.db, parsed.projectId);
    const goal = project?.dailyGoal ?? 1000;
    return getDailyProgress(ctx.db, parsed.projectId, goal, parsed.date ?? todayKey());
  });
}
