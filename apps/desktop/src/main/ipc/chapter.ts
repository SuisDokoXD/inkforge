import { ipcMain } from "electron";
import type {
  ChapterAutosavePeekResponse,
  ChapterExportMdResponse,
  ChapterReadResponse,
  ChapterRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  clearChapterAutosave,
  createChapter,
  deleteChapter,
  destroyChapter,
  emptyChapterTrash,
  exportMarkdownChapter,
  getTrashChapters,
  importMarkdownChapter,
  importObsidianVault,
  listChapterRecords,
  peekChapterAutosave,
  readChapter,
  reorderChapterRecords,
  restoreChapterFromTrash,
  updateChapterRecord,
  writeChapterAutosave,
} from "../services/chapter-service";
import {
  parseChapterAutosaveClearInput,
  parseChapterAutosavePeekInput,
  parseChapterAutosaveWriteInput,
  parseChapterCreateInput,
  parseChapterDeleteInput,
  parseChapterExportMdInput,
  parseChapterImportMdInput,
  parseChapterListInput,
  parseChapterReadInput,
  parseChapterReorderInput,
  parseChapterUpdateInput,
} from "./validation";

const CHAPTER_CREATE: typeof ipcChannels.chapterCreate = "chapter:create";
const CHAPTER_UPDATE: typeof ipcChannels.chapterUpdate = "chapter:update";
const CHAPTER_LIST: typeof ipcChannels.chapterList = "chapter:list";
const CHAPTER_READ: typeof ipcChannels.chapterRead = "chapter:read";
const CHAPTER_DELETE: typeof ipcChannels.chapterDelete = "chapter:delete";
const CHAPTER_REORDER: typeof ipcChannels.chapterReorder = "chapter:reorder";
const CHAPTER_IMPORT_MD: typeof ipcChannels.chapterImportMd = "chapter:import-md";
const CHAPTER_EXPORT_MD: typeof ipcChannels.chapterExportMd = "chapter:export-md";
const CHAPTER_AUTOSAVE_WRITE: typeof ipcChannels.chapterAutosaveWrite = "chapter:autosave-write";
const CHAPTER_AUTOSAVE_PEEK: typeof ipcChannels.chapterAutosavePeek = "chapter:autosave-peek";
const CHAPTER_AUTOSAVE_CLEAR: typeof ipcChannels.chapterAutosaveClear = "chapter:autosave-clear";

export function registerChapterHandlers(): void {
  ipcMain.handle(CHAPTER_CREATE, async (_event, input: unknown): Promise<ChapterRecord> => {
    return createChapter(parseChapterCreateInput(input));
  });

  ipcMain.handle(CHAPTER_UPDATE, async (_event, input: unknown): Promise<ChapterRecord> => {
    return updateChapterRecord(parseChapterUpdateInput(input));
  });

  ipcMain.handle(CHAPTER_LIST, async (_event, input: unknown): Promise<ChapterRecord[]> => {
    return listChapterRecords(parseChapterListInput(input));
  });

  ipcMain.handle(CHAPTER_READ, async (_event, input: unknown): Promise<ChapterReadResponse> => {
    return readChapter(parseChapterReadInput(input));
  });

  ipcMain.handle(CHAPTER_DELETE, async (_event, input: unknown): Promise<{ id: string }> => {
    return deleteChapter(parseChapterDeleteInput(input));
  });

  ipcMain.handle(
    CHAPTER_REORDER,
    async (_event, input: unknown): Promise<ChapterRecord[]> => {
      return reorderChapterRecords(parseChapterReorderInput(input));
    },
  );

  ipcMain.handle(
    CHAPTER_IMPORT_MD,
    async (_event, input: unknown): Promise<ChapterRecord> => {
      return importMarkdownChapter(parseChapterImportMdInput(input));
    },
  );

  ipcMain.handle(
    CHAPTER_EXPORT_MD,
    async (_event, input: unknown): Promise<ChapterExportMdResponse> => {
      return exportMarkdownChapter(parseChapterExportMdInput(input));
    },
  );

  ipcMain.handle(
    CHAPTER_AUTOSAVE_WRITE,
    async (_event, input: unknown): Promise<{ savedAt: number }> => {
      return writeChapterAutosave(parseChapterAutosaveWriteInput(input));
    },
  );

  // Recovery: an autosave is only considered stale when it was written
  // BEFORE the last DB save — otherwise the user's last keystrokes before a
  // crash could be silently dropped.
  ipcMain.handle(
    CHAPTER_AUTOSAVE_PEEK,
    async (_event, input: unknown): Promise<ChapterAutosavePeekResponse> => {
      return peekChapterAutosave(parseChapterAutosavePeekInput(input));
    },
  );

  ipcMain.handle(
    CHAPTER_AUTOSAVE_CLEAR,
    async (_event, input: unknown): Promise<{ ok: true }> => {
      return clearChapterAutosave(parseChapterAutosaveClearInput(input));
    },
  );

  // A6: 回收站 IPC
  ipcMain.handle("chapter:trash-list", async (_event, input: unknown) => {
    const parsed = input as { projectId: string };
    return getTrashChapters(parsed.projectId);
  });

  ipcMain.handle("chapter:trash-restore", async (_event, input: unknown) => {
    const parsed = input as { id: string };
    return restoreChapterFromTrash(parsed.id);
  });

  ipcMain.handle("chapter:trash-destroy", async (_event, input: unknown) => {
    const parsed = input as { id: string };
    return destroyChapter(parsed.id);
  });

  ipcMain.handle("chapter:trash-empty", async (_event, input: unknown) => {
    const parsed = input as { projectId: string };
    return emptyChapterTrash(parsed.projectId);
  });

  // C8: Obsidian vault 批量导入
  ipcMain.handle("chapter:import-obsidian", async (_event, input: unknown) => {
    const parsed = input as { projectId: string };
    // 弹出文件夹选择对话框
    const { dialog } = await import("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择 Obsidian Vault 文件夹",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, chapters: [] };
    }
    return importObsidianVault(parsed.projectId, result.filePaths[0]);
  });
}
