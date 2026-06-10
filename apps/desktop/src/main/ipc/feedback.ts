import { ipcMain } from "electron";
import {
  deleteEmptyFeedbacksByChapter,
  deleteFeedbacksByChapter,
  listFeedbacksByChapter,
  setFeedbackDismissed,
} from "@inkforge/storage";
import type {
  AIFeedbackRecord,
  FeedbackClearChapterInput,
  FeedbackDeleteEmptyInput,
  FeedbackDismissInput,
  FeedbackListInput,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const FEEDBACK_LIST: typeof ipcChannels.feedbackList = "feedback:list";
const FEEDBACK_DISMISS: typeof ipcChannels.feedbackDismiss = "feedback:dismiss";
const FEEDBACK_DELETE_EMPTY: typeof ipcChannels.feedbackDeleteEmpty = "feedback:delete-empty";
const FEEDBACK_CLEAR_CHAPTER: typeof ipcChannels.feedbackClearChapter = "feedback:clear-chapter";

export function registerFeedbackHandlers(): void {
  ipcMain.handle(FEEDBACK_LIST, async (_event, input: FeedbackListInput): Promise<AIFeedbackRecord[]> => {
    const ctx = getAppContext();
    return listFeedbacksByChapter(ctx.db, input.chapterId, input.limit ?? 50);
  });
  ipcMain.handle(
    FEEDBACK_DISMISS,
    async (_event, input: FeedbackDismissInput): Promise<{ id: string; dismissed: boolean }> => {
      const ctx = getAppContext();
      const dismissed = input.dismissed ?? true;
      setFeedbackDismissed(ctx.db, input.id, dismissed);
      return { id: input.id, dismissed };
    },
  );
  ipcMain.handle(
    FEEDBACK_DELETE_EMPTY,
    async (_event, input: FeedbackDeleteEmptyInput): Promise<{ deleted: number }> => {
      const ctx = getAppContext();
      return { deleted: deleteEmptyFeedbacksByChapter(ctx.db, input.chapterId) };
    },
  );
  ipcMain.handle(
    FEEDBACK_CLEAR_CHAPTER,
    async (_event, input: FeedbackClearChapterInput): Promise<{ deleted: number }> => {
      const ctx = getAppContext();
      return { deleted: deleteFeedbacksByChapter(ctx.db, input.chapterId) };
    },
  );
}
