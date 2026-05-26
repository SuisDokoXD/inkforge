// =============================================================================
// Author's Note 服务层（v24）
// =============================================================================
// 每项目最多一条 note。GET 缺省返回 null；UPSERT 用 storage 层的 ON CONFLICT。
// =============================================================================

import {
  deleteAuthorNote,
  getAuthorNoteByProject,
  upsertAuthorNote,
} from "@inkforge/storage";
import type {
  AuthorNoteDeleteInput,
  AuthorNoteGetInput,
  AuthorNoteRecord,
  AuthorNoteUpsertInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

export function getAuthorNote(
  input: AuthorNoteGetInput,
): AuthorNoteRecord | null {
  const ctx = getAppContext();
  return getAuthorNoteByProject(ctx.db, input.projectId);
}

export function upsertAuthorNoteRecord(
  input: AuthorNoteUpsertInput,
): AuthorNoteRecord {
  const ctx = getAppContext();
  return upsertAuthorNote(ctx.db, input);
}

export function deleteAuthorNoteRecord(
  input: AuthorNoteDeleteInput,
): { projectId: string } {
  const ctx = getAppContext();
  deleteAuthorNote(ctx.db, input.projectId);
  return { projectId: input.projectId };
}
