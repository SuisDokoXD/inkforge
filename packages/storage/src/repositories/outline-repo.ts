import type { DB } from "../db";
import type { OutlineCardRecord } from "@inkforge/shared";

type OutlineRow = {
  id: string;
  project_id: string;
  chapter_id: string | null;
  title: string;
  content: string;
  status: string;
  order: number;
  created_at: string;
  updated_at: string;
};

function rowToRecord(row: OutlineRow): OutlineCardRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    title: row.title,
    content: row.content,
    status: row.status,
    order: row.order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateOutlineRow {
  id: string;
  projectId: string;
  chapterId?: string | null;
  title: string;
  content?: string;
  status?: string;
  order?: number;
}

export function insertOutline(db: DB, input: CreateOutlineRow): OutlineCardRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO outline_cards (id, project_id, chapter_id, title, content, status, "order", created_at, updated_at)
     VALUES (@id, @project_id, @chapter_id, @title, @content, @status, @order, @created_at, @updated_at)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    chapter_id: input.chapterId ?? null,
    title: input.title,
    content: input.content ?? "",
    status: input.status ?? "draft",
    order: input.order ?? 0,
    created_at: now,
    updated_at: now,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    chapterId: input.chapterId ?? null,
    title: input.title,
    content: input.content ?? "",
    status: input.status ?? "draft",
    order: input.order ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateOutlineRow {
  id: string;
  title?: string;
  content?: string;
  status?: string;
  order?: number;
  chapterId?: string | null;
}

export function updateOutline(db: DB, input: UpdateOutlineRow): OutlineCardRecord {
  const existing = db
    .prepare(`SELECT * FROM outline_cards WHERE id = ?`)
    .get(input.id) as OutlineRow | undefined;
  if (!existing) throw new Error(`Outline not found: ${input.id}`);
  const next: OutlineRow = {
    ...existing,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    status: input.status ?? existing.status,
    order: input.order ?? existing.order,
    chapter_id: input.chapterId === undefined ? existing.chapter_id : input.chapterId,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE outline_cards SET title = @title, content = @content, status = @status, "order" = @order,
     chapter_id = @chapter_id, updated_at = @updated_at WHERE id = @id`,
  ).run({
    id: next.id,
    title: next.title,
    content: next.content,
    status: next.status,
    order: next.order,
    chapter_id: next.chapter_id,
    updated_at: next.updated_at,
  });
  return rowToRecord(next);
}

export function deleteOutline(db: DB, id: string): void {
  db.prepare(`DELETE FROM outline_cards WHERE id = ?`).run(id);
}

export function getOutline(db: DB, id: string): OutlineCardRecord | null {
  const row = db.prepare(`SELECT * FROM outline_cards WHERE id = ?`).get(id) as
    | OutlineRow
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function listOutlines(db: DB, projectId: string, chapterId?: string): OutlineCardRecord[] {
  let rows: OutlineRow[];
  if (chapterId) {
    rows = db
      .prepare(
        `SELECT * FROM outline_cards WHERE project_id = ? AND chapter_id = ? ORDER BY "order" ASC, created_at ASC`,
      )
      .all(projectId, chapterId) as OutlineRow[];
  } else {
    rows = db
      .prepare(`SELECT * FROM outline_cards WHERE project_id = ? ORDER BY "order" ASC, created_at ASC`)
      .all(projectId) as OutlineRow[];
  }
  return rows.map(rowToRecord);
}
