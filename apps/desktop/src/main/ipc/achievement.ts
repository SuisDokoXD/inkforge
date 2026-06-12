import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ipcChannels,
  ipcEventChannels,
  type AchievementCheckResponse,
  type AchievementStatsResponse,
} from "@inkforge/shared";
import {
  checkAchievementsAndNotify,
  getAchievementStats,
  listAchievements,
  setAchievementUnlockPublisher,
} from "../services/achievement-service";
import {
  parseAchievementCheckInput,
  parseAchievementListInput,
  parseAchievementStatsInput,
} from "./validation";

export function registerAchievementHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  setAchievementUnlockPublisher((projectId, records) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    for (const ach of records) {
      try {
        win.webContents.send(ipcEventChannels.achievementUnlocked, {
          projectId,
          achievement: ach,
        });
      } catch {
        /* ignore */
      }
    }
  });

  ipcMain.handle(
    ipcChannels.achievementList,
    async (_event, input: unknown) => {
      return listAchievements(parseAchievementListInput(input).projectId);
    },
  );

  ipcMain.handle(
    ipcChannels.achievementCheck,
    async (
      _event,
      input: unknown,
    ): Promise<AchievementCheckResponse> => {
      const parsed = parseAchievementCheckInput(input);
      const newlyUnlocked = checkAchievementsAndNotify(
        parsed.projectId,
        parsed.trigger ?? "manual",
      );
      return { newlyUnlocked };
    },
  );

  ipcMain.handle(
    ipcChannels.achievementStats,
    async (_event, input: unknown): Promise<AchievementStatsResponse> => {
      return getAchievementStats(parseAchievementStatsInput(input).projectId);
    },
  );
}
