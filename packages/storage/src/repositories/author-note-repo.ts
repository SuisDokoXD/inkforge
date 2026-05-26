// =============================================================================
// Author's Note 数据访问层（v24）
// =============================================================================
// 每项目最多一条"全局风格批注"，给 skill / autowriter / chat 等 LLM 调用
// 链路提供"始终注入"的口吻 / 风格 / 禁忌锚点。
// UNIQUE project_id 保证一项目一条，UPSERT 写入。
// =============================================================================

import { randomUUID } from "crypto";
import type { DB } from "../db";
import type { AuthorNotePosition, AuthorNoteRecord } from "@inkforge/shared";

type AuthorNoteRow = {
  id: string;
  project_id: string;
  text: string;
  position: string;
  enabled: number;
  updated_at: string;
};

function coercePosition(value: unknown): AuthorNotePosition {
  return value === "after" ? "after" : "before";
}

function rowToRecord(row: AuthorNoteRow): AuthorNoteRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    text: row.text,
    position: coercePosition(row.position),
    enabled: row.enabled === 1,
    updatedAt: row.updated_at,
  };
}

// 取项目对应的 note（一对一）。缺省返回 null，调用方判断是否注入。
export function getAuthorNoteByProject(
  db: DB,
  projectId: string,
): AuthorNoteRecord | null {
  const row = db
    .prepare(`SELECT * FROM author_notes WHERE project_id = ?`)
    .get(projectId) as AuthorNoteRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface UpsertAuthorNoteInput {
  projectId: string;
  text?: string;
  position?: AuthorNotePosition;
  enabled?: boolean;
}

// UPSERT 写入。第一次写自动生成 id；后续更新保留原 id。
// project_id UNIQUE 让 INSERT ... ON CONFLICT(project_id) 干净生效。
export function upsertAuthorNote(
  db: DB,
  input: UpsertAuthorNoteInput,
): AuthorNoteRecord {
  const now = new Date().toISOString();
  const existing = getAuthorNoteByProject(db, input.projectId);
  const id = existing?.id ?? randomUUID();
  const row: AuthorNoteRow = {
    id,
    project_id: input.projectId,
    text: input.text ?? existing?.text ?? "",
    position: input.position ?? existing?.position ?? "before",
    enabled:
      input.enabled !== undefined
        ? input.enabled
          ? 1
          : 0
        : existing?.enabled === false
          ? 0
          : 1,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO author_notes (id, project_id, text, position, enabled, updated_at)
     VALUES (@id, @project_id, @text, @position, @enabled, @updated_at)
     ON CONFLICT(project_id) DO UPDATE SET
       text = excluded.text,
       position = excluded.position,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
  ).run(row);
  return rowToRecord(row);
}

// 主动清空（不删行，置空文本 + 禁用）。
// 完全删除一般不需要 —— 用户可能想保留草稿；如果确实要删，调用 delete。
export function deleteAuthorNote(db: DB, projectId: string): void {
  db.prepare(`DELETE FROM author_notes WHERE project_id = ?`).run(projectId);
}
