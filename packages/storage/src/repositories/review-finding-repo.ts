import type { DB } from "../db";
import type { ReviewFindingRecord, ReviewSeverity } from "@inkforge/shared";

type ReviewFindingRow = {
  id: string;
  report_id: string;
  dimension_id: string;
  chapter_id: string | null;
  excerpt: string;
  excerpt_start: number | null;
  excerpt_end: number | null;
  severity: string;
  suggestion: string;
  dismissed: number;
  created_at: string;
};

function normalizeSeverity(value: string): ReviewSeverity {
  return value === "info" || value === "error" ? value : "warn";
}

function rowToRecord(row: ReviewFindingRow): ReviewFindingRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    dimensionId: row.dimension_id,
    chapterId: row.chapter_id,
    excerpt: row.excerpt,
    excerptStart: row.excerpt_start,
    excerptEnd: row.excerpt_end,
    severity: normalizeSeverity(row.severity),
    suggestion: row.suggestion,
    dismissed: row.dismissed === 1,
    createdAt: row.created_at,
  };
}

export interface InsertReviewFindingInput {
  id: string;
  reportId: string;
  dimensionId: string;
  chapterId: string | null;
  excerpt: string;
  excerptStart?: number | null;
  excerptEnd?: number | null;
  severity: ReviewSeverity;
  suggestion: string;
}

export function insertReviewFinding(
  db: DB,
  input: InsertReviewFindingInput,
): ReviewFindingRecord {
  const now = new Date().toISOString();
  const row: ReviewFindingRow = {
    id: input.id,
    report_id: input.reportId,
    dimension_id: input.dimensionId,
    chapter_id: input.chapterId,
    excerpt: input.excerpt,
    excerpt_start: input.excerptStart ?? null,
    excerpt_end: input.excerptEnd ?? null,
    severity: input.severity,
    suggestion: input.suggestion,
    dismissed: 0,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO review_findings
       (id, report_id, dimension_id, chapter_id, excerpt, excerpt_start,
        excerpt_end, severity, suggestion, dismissed, created_at)
     VALUES (@id, @report_id, @dimension_id, @chapter_id, @excerpt,
             @excerpt_start, @excerpt_end, @severity, @suggestion,
             @dismissed, @created_at)`,
  ).run(row);
  return rowToRecord(row);
}

export function listReviewFindingsForReport(
  db: DB,
  reportId: string,
): ReviewFindingRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM review_findings
       WHERE report_id = ?
       ORDER BY
         CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
         created_at ASC`,
    )
    .all(reportId) as ReviewFindingRow[];
  return rows.map(rowToRecord);
}

export function setReviewFindingDismissed(
  db: DB,
  id: string,
  dismissed: boolean,
): ReviewFindingRecord | null {
  const info = db
    .prepare(`UPDATE review_findings SET dismissed = ? WHERE id = ?`)
    .run(dismissed ? 1 : 0, id);
  if (info.changes === 0) return null;
  const row = db
    .prepare(`SELECT * FROM review_findings WHERE id = ?`)
    .get(id) as ReviewFindingRow | undefined;
  return row ? rowToRecord(row) : null;
}

// 单条查询：Audit→Fix 二步审查需要按 findingId 取出原始 finding 才能定位
// chapterId / excerpt / suggestion 三件套，再喂给 fix LLM 通道。
export function getReviewFindingById(
  db: DB,
  id: string,
): ReviewFindingRecord | null {
  const row = db
    .prepare(`SELECT * FROM review_findings WHERE id = ?`)
    .get(id) as ReviewFindingRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function countReviewFindings(
  db: DB,
  reportId: string,
): { dimensionId: string; count: number }[] {
  return db
    .prepare(
      `SELECT dimension_id as dimensionId, COUNT(*) as count
       FROM review_findings
       WHERE report_id = ?
       GROUP BY dimension_id`,
    )
    .all(reportId) as { dimensionId: string; count: number }[];
}
