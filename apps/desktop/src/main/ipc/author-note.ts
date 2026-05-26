// =============================================================================
// Author's Note IPC handlers (v24)
// =============================================================================

import { ipcMain } from "electron";
import type {
  AuthorNoteDeleteInput,
  AuthorNoteGetInput,
  AuthorNoteRecord,
  AuthorNoteUpsertInput,
} from "@inkforge/shared";
import {
  deleteAuthorNoteRecord,
  getAuthorNote,
  upsertAuthorNoteRecord,
} from "../services/author-note-service";

export function registerAuthorNoteHandlers(): void {
  ipcMain.handle(
    "author-note:get",
    async (_e, input: AuthorNoteGetInput): Promise<AuthorNoteRecord | null> =>
      getAuthorNote(input),
  );
  ipcMain.handle(
    "author-note:upsert",
    async (_e, input: AuthorNoteUpsertInput): Promise<AuthorNoteRecord> =>
      upsertAuthorNoteRecord(input),
  );
  ipcMain.handle(
    "author-note:delete",
    async (
      _e,
      input: AuthorNoteDeleteInput,
    ): Promise<{ projectId: string }> => deleteAuthorNoteRecord(input),
  );
}
