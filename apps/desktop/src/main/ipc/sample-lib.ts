import { ipcMain } from "electron";
import {
  createSampleLib,
  deleteSampleLib,
  listSampleLibs,
} from "@inkforge/storage";
import type {
  SampleLibImportResponse,
  SampleLibRecord,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  importEpubAsLib,
  importTextAsLib,
} from "../services/sample-lib-service";
import {
  parseSampleLibCreateInput,
  parseSampleLibDeleteInput,
  parseSampleLibImportEpubInput,
  parseSampleLibImportTextInput,
  parseSampleLibListInput,
} from "./validation";

const LIST = "sample-lib:list";
const CREATE = "sample-lib:create";
const DELETE = "sample-lib:delete";
const IMPORT_TEXT = "sample-lib:import-text";
const IMPORT_EPUB = "sample-lib:import-epub";

export function registerSampleLibHandlers(): void {
  ipcMain.handle(LIST, async (_e, input: unknown): Promise<SampleLibRecord[]> => {
    const parsed = parseSampleLibListInput(input);
    const ctx = getAppContext();
    return listSampleLibs(ctx.db, parsed.projectId);
  });

  ipcMain.handle(CREATE, async (_e, input: unknown): Promise<SampleLibRecord> => {
    const parsed = parseSampleLibCreateInput(input);
    const ctx = getAppContext();
    return createSampleLib(ctx.db, {
      projectId: parsed.projectId,
      title: parsed.title,
      author: parsed.author ?? null,
      notes: parsed.notes ?? null,
      chunks: parsed.chunks?.map((c) => ({
        ordinal: c.ordinal,
        chapterTitle: c.chapterTitle ?? null,
        text: c.text,
      })),
    });
  });

  ipcMain.handle(DELETE, async (_e, input: unknown): Promise<{ libId: string }> => {
    const parsed = parseSampleLibDeleteInput(input);
    const ctx = getAppContext();
    deleteSampleLib(ctx.db, parsed.libId);
    return { libId: parsed.libId };
  });

  ipcMain.handle(IMPORT_TEXT, async (_e, input: unknown): Promise<SampleLibImportResponse> => {
    return importTextAsLib(parseSampleLibImportTextInput(input));
  });

  ipcMain.handle(IMPORT_EPUB, async (_e, input: unknown): Promise<SampleLibImportResponse> => {
    return importEpubAsLib(parseSampleLibImportEpubInput(input));
  });
}
