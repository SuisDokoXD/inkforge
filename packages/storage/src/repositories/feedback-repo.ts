import type { DB } from "../db";
import type { AIFeedbackRecord } from "@inkforge/shared";

type FeedbackRow = {
  id: string;
  project_id: string;
  chapter_id: string;
  type: string;
  payload: string;
  trigger: string;
  created_at: string;
  dismissed: number;
};

function rowToRecord(row: FeedbackRow): AIFeedbackRecord {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload);
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    type: row.type,
    payload,
    trigger: row.trigger,
    createdAt: row.created_at,
    dismissed: row.dismissed === 1,
  };
}

export interface CreateFeedbackRow {
  id: string;
  projectId: string;
  chapterId: string;
  type: string;
  payload: Record<string, unknown>;
  trigger: string;
}

export function insertFeedback(db: DB, input: CreateFeedbackRow): AIFeedbackRecord {
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_feedbacks (id, project_id, chapter_id, type, payload, trigger, created_at, dismissed)
     VALUES (@id, @project_id, @chapter_id, @type, @payload, @trigger, @created_at, 0)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    chapter_id: input.chapterId,
    type: input.type,
    payload: JSON.stringify(input.payload),
    trigger: input.trigger,
    created_at: createdAt,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    type: input.type,
    payload: input.payload,
    trigger: input.trigger,
    createdAt,
    dismissed: false,
  };
}

export function listFeedbacksByChapter(db: DB, chapterId: string, limit = 50): AIFeedbackRecord[] {
  const rows = db
    .prepare(`SELECT * FROM ai_feedbacks WHERE chapter_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(chapterId, limit) as FeedbackRow[];
  return rows.map(rowToRecord);
}

export function listFeedbacksByProject(db: DB, projectId: string, limit = 100): AIFeedbackRecord[] {
  const rows = db
    .prepare(`SELECT * FROM ai_feedbacks WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(projectId, limit) as FeedbackRow[];
  return rows.map(rowToRecord);
}

export function setFeedbackDismissed(db: DB, id: string, dismissed: boolean): void {
  db.prepare(`UPDATE ai_feedbacks SET dismissed = ? WHERE id = ?`).run(dismissed ? 1 : 0, id);
}

export function deleteEmptyFeedbacksByChapter(db: DB, chapterId: string): number {
  const result = db
    .prepare(
      `DELETE FROM ai_feedbacks
       WHERE chapter_id = ?
         AND (
           payload IS NULL
           OR TRIM(payload) = ''
           OR (json_valid(payload) = 1 AND TRIM(COALESCE(json_extract(payload, '$.text'), '')) = '')
         )`,
    )
    .run(chapterId);
  return Number(result.changes ?? 0);
}

export function deleteFeedbacksByChapter(db: DB, chapterId: string): number {
  const result = db.prepare(`DELETE FROM ai_feedbacks WHERE chapter_id = ?`).run(chapterId);
  return Number(result.changes ?? 0);
}
