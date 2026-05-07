import type { DB } from "../db";
import type { ChapterSummaryRecord } from "@inkforge/shared";

interface Row {
  chapter_id: string;
  project_id: string;
  summary: string;
  model: string | null;
  provider_id: string | null;
  source_word_count: number;
  generated_at: string;
}

function toRecord(row: Row): ChapterSummaryRecord {
  return {
    chapterId: row.chapter_id,
    projectId: row.project_id,
    summary: row.summary,
    model: row.model,
    providerId: row.provider_id,
    sourceWordCount: row.source_word_count,
    generatedAt: row.generated_at,
  };
}

export interface UpsertChapterSummaryInput {
  chapterId: string;
  projectId: string;
  summary: string;
  model?: string | null;
  providerId?: string | null;
  sourceWordCount?: number;
}

/**
 * UPSERT：每章只有一份摘要，重生成直接覆盖。
 */
export function upsertChapterSummary(
  db: DB,
  input: UpsertChapterSummaryInput,
): ChapterSummaryRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chapter_summaries
       (chapter_id, project_id, summary, model, provider_id, source_word_count, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chapter_id) DO UPDATE SET
       summary = excluded.summary,
       model = excluded.model,
       provider_id = excluded.provider_id,
       source_word_count = excluded.source_word_count,
       generated_at = excluded.generated_at`,
  ).run(
    input.chapterId,
    input.projectId,
    input.summary,
    input.model ?? null,
    input.providerId ?? null,
    input.sourceWordCount ?? 0,
    now,
  );
  return getChapterSummary(db, input.chapterId)!;
}

export function getChapterSummary(
  db: DB,
  chapterId: string,
): ChapterSummaryRecord | null {
  const row = db
    .prepare(
      `SELECT chapter_id, project_id, summary, model, provider_id,
              source_word_count, generated_at
         FROM chapter_summaries WHERE chapter_id = ?`,
    )
    .get(chapterId) as Row | undefined;
  return row ? toRecord(row) : null;
}

/**
 * 列出某项目所有章节的摘要，按"对应章节的 order"升序。
 *  - 用 LEFT JOIN chapters 拿 order；如果章节已删则 summary 也被 CASCADE 删，
 *    这里 INNER JOIN 即可。
 */
export function listChapterSummariesByProject(
  db: DB,
  projectId: string,
): ChapterSummaryRecord[] {
  const rows = db
    .prepare(
      `SELECT s.chapter_id, s.project_id, s.summary, s.model, s.provider_id,
              s.source_word_count, s.generated_at
         FROM chapter_summaries s
         INNER JOIN chapters c ON c.id = s.chapter_id
        WHERE s.project_id = ?
        ORDER BY c."order" ASC`,
    )
    .all(projectId) as Row[];
  return rows.map(toRecord);
}

export function deleteChapterSummary(db: DB, chapterId: string): void {
  db.prepare(`DELETE FROM chapter_summaries WHERE chapter_id = ?`).run(chapterId);
}
