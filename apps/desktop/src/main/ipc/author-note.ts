// =============================================================================
// Author's Note IPC handlers (v24)
// =============================================================================

import { ipcMain } from "electron";
import type {
  AuthorNoteRecord,
} from "@inkforge/shared";
import {
  deleteAuthorNoteRecord,
  getAuthorNote,
  upsertAuthorNoteRecord,
} from "../services/author-note-service";
import {
  parseAuthorNoteDeleteInput,
  parseAuthorNoteGetInput,
  parseAuthorNoteUpsertInput,
} from "./validation";

export function registerAuthorNoteHandlers(): void {
  ipcMain.handle(
    "author-note:get",
    async (_e, input: unknown): Promise<AuthorNoteRecord | null> =>
      getAuthorNote(parseAuthorNoteGetInput(input)),
  );
  ipcMain.handle(
    "author-note:upsert",
    async (_e, input: unknown): Promise<AuthorNoteRecord> =>
      upsertAuthorNoteRecord(parseAuthorNoteUpsertInput(input)),
  );
  ipcMain.handle(
    "author-note:delete",
    async (
      _e,
      input: unknown,
    ): Promise<{ projectId: string }> =>
      deleteAuthorNoteRecord(parseAuthorNoteDeleteInput(input)),
  );
}
