import { ipcMain } from "electron";
import {
  ipcChannels,
  type ChapterLogEntryRecord,
} from "@inkforge/shared";
import {
  appendAiEntry,
  appendManualEntry,
  deleteEntry,
  listEntries,
} from "../services/chapter-log-service";
import {
  parseChapterLogAppendAiInput,
  parseChapterLogAppendManualInput,
  parseChapterLogDeleteInput,
  parseChapterLogListInput,
} from "./validation";

const LOG_LIST: typeof ipcChannels.chapterLogList = "chapter-log:list";
const LOG_APPEND_MANUAL: typeof ipcChannels.chapterLogAppendManual =
  "chapter-log:append-manual";
const LOG_APPEND_AI: typeof ipcChannels.chapterLogAppendAi = "chapter-log:append-ai";
const LOG_DELETE: typeof ipcChannels.chapterLogDelete = "chapter-log:delete";

export function registerChapterLogHandlers(): void {
  ipcMain.handle(
    LOG_LIST,
    async (_event, input: unknown): Promise<ChapterLogEntryRecord[]> => {
      const parsed = parseChapterLogListInput(input);
      return listEntries(parsed.chapterId, parsed.limit, parsed.desc);
    },
  );

  ipcMain.handle(
    LOG_APPEND_MANUAL,
    async (
      _event,
      input: unknown,
    ): Promise<ChapterLogEntryRecord> => {
      return appendManualEntry(parseChapterLogAppendManualInput(input));
    },
  );

  ipcMain.handle(
    LOG_APPEND_AI,
    async (_event, input: unknown): Promise<ChapterLogEntryRecord> => {
      const parsed = parseChapterLogAppendAiInput(input);
      return appendAiEntry({
        chapterId: parsed.chapterId,
        projectId: parsed.projectId,
        kind: parsed.kind,
        content: parsed.content,
        metadata: parsed.metadata,
      });
    },
  );

  ipcMain.handle(
    LOG_DELETE,
    async (_event, input: unknown): Promise<{ entryId: string }> => {
      return deleteEntry(parseChapterLogDeleteInput(input).entryId);
    },
  );
}
