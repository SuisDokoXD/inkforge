import { ipcMain } from "electron";
import {
  deleteEmptyFeedbacksByChapter,
  deleteFeedbacksByChapter,
  listFeedbacksByChapter,
  setFeedbackDismissed,
} from "@inkforge/storage";
import type {
  AIFeedbackRecord,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  parseFeedbackClearChapterInput,
  parseFeedbackDeleteEmptyInput,
  parseFeedbackDismissInput,
  parseFeedbackListInput,
} from "./validation";

const FEEDBACK_LIST: typeof ipcChannels.feedbackList = "feedback:list";
const FEEDBACK_DISMISS: typeof ipcChannels.feedbackDismiss = "feedback:dismiss";
const FEEDBACK_DELETE_EMPTY: typeof ipcChannels.feedbackDeleteEmpty = "feedback:delete-empty";
const FEEDBACK_CLEAR_CHAPTER: typeof ipcChannels.feedbackClearChapter = "feedback:clear-chapter";

export function registerFeedbackHandlers(): void {
  ipcMain.handle(FEEDBACK_LIST, async (_event, input: unknown): Promise<AIFeedbackRecord[]> => {
    const parsed = parseFeedbackListInput(input);
    const ctx = getAppContext();
    return listFeedbacksByChapter(ctx.db, parsed.chapterId, parsed.limit ?? 50);
  });
  ipcMain.handle(
    FEEDBACK_DISMISS,
    async (_event, input: unknown): Promise<{ id: string; dismissed: boolean }> => {
      const parsed = parseFeedbackDismissInput(input);
      const ctx = getAppContext();
      const dismissed = parsed.dismissed ?? true;
      setFeedbackDismissed(ctx.db, parsed.id, dismissed);
      return { id: parsed.id, dismissed };
    },
  );
  ipcMain.handle(
    FEEDBACK_DELETE_EMPTY,
    async (_event, input: unknown): Promise<{ deleted: number }> => {
      const parsed = parseFeedbackDeleteEmptyInput(input);
      const ctx = getAppContext();
      return { deleted: deleteEmptyFeedbacksByChapter(ctx.db, parsed.chapterId) };
    },
  );
  ipcMain.handle(
    FEEDBACK_CLEAR_CHAPTER,
    async (_event, input: unknown): Promise<{ deleted: number }> => {
      const parsed = parseFeedbackClearChapterInput(input);
      const ctx = getAppContext();
      return { deleted: deleteFeedbacksByChapter(ctx.db, parsed.chapterId) };
    },
  );
}
