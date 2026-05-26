// =============================================================================
// World Info Trace（激活诊断快照）数据访问层
// =============================================================================
// 每次 world-info-activator 跑完都落一条 trace，UI 上做诊断面板可视化：
// 哪些 entry 被命中 / 哪些被概率掷骰刷掉 / 哪些被 token 预算砍掉。
//
// 设计要点：
//   - payload 字段把 WorldInfoEntryTrace[] / charsUsed / charBudget 一并塞进
//     单列 JSON，避免给一次诊断快照拆 N 张子表
//   - 每项目只保留最近 N 条（默认 30）：append 后调一次 trimProjectTraces
//   - run_id 可空，便于关联 AutoWriter 那次具体的运行
// =============================================================================

import type { DB } from "../db";
import type {
  WorldInfoEntryTrace,
  WorldInfoTraceRecord,
} from "@inkforge/shared";

type WorldInfoTraceRow = {
  id: string;
  project_id: string;
  run_id: string | null;
  scene: string;
  scan_text_preview: string;
  payload: string;
  created_at: string;
};

// 反序列化 payload 列。坏数据时退化为空快照，保证 UI 不崩。
function parsePayload(value: string): {
  entries: WorldInfoEntryTrace[];
  charsUsed: number;
  charBudget: number;
} {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const p = parsed as Partial<{
        entries: WorldInfoEntryTrace[];
        charsUsed: number;
        charBudget: number;
      }>;
      return {
        entries: Array.isArray(p.entries) ? p.entries : [],
        charsUsed: typeof p.charsUsed === "number" ? p.charsUsed : 0,
        charBudget: typeof p.charBudget === "number" ? p.charBudget : 0,
      };
    }
  } catch {
    /* fallthrough */
  }
  return { entries: [], charsUsed: 0, charBudget: 0 };
}

function rowToRecord(row: WorldInfoTraceRow): WorldInfoTraceRecord {
  const payload = parsePayload(row.payload);
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    scene: row.scene,
    scanTextPreview: row.scan_text_preview,
    entries: payload.entries,
    charsUsed: payload.charsUsed,
    charBudget: payload.charBudget,
    createdAt: row.created_at,
  };
}

export interface AppendWorldInfoTraceInput {
  id: string;
  projectId: string;
  runId?: string | null;
  scene?: string;
  scanTextPreview: string;
  entries: WorldInfoEntryTrace[];
  charsUsed: number;
  charBudget: number;
}

// 追加一条诊断。scanTextPreview 应由调用方截断（建议 ≤200 字），
// 避免一条扫描文本占满 trace 列。
export function appendWorldInfoTrace(
  db: DB,
  input: AppendWorldInfoTraceInput,
): WorldInfoTraceRecord {
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    entries: input.entries,
    charsUsed: input.charsUsed,
    charBudget: input.charBudget,
  });
  const row: WorldInfoTraceRow = {
    id: input.id,
    project_id: input.projectId,
    run_id: input.runId ?? null,
    scene: input.scene ?? "skill",
    scan_text_preview: input.scanTextPreview,
    payload,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO world_info_traces
       (id, project_id, run_id, scene, scan_text_preview, payload, created_at)
     VALUES (@id, @project_id, @run_id, @scene, @scan_text_preview, @payload, @created_at)`,
  ).run(row);
  return rowToRecord(row);
}

// 最近 N 条诊断，按 created_at DESC。N 默认 30 对应 UI 面板的滚动深度。
export function listRecentWorldInfoTraces(
  db: DB,
  projectId: string,
  limit = 30,
): WorldInfoTraceRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM world_info_traces
       WHERE project_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(projectId, limit) as WorldInfoTraceRow[];
  return rows.map(rowToRecord);
}

export function getWorldInfoTraceById(
  db: DB,
  id: string,
): WorldInfoTraceRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_info_traces WHERE id = ?`)
    .get(id) as WorldInfoTraceRow | undefined;
  return row ? rowToRecord(row) : null;
}

// 修剪：按项目保留最近 keep 条，多出来的删掉。
// 在 appendWorldInfoTrace 之后异步调一次即可，避免事务里做大批删除拖慢写。
// 返回被删除的行数（调试用）。
export function trimProjectTraces(
  db: DB,
  projectId: string,
  keep = 30,
): number {
  const res = db
    .prepare(
      `DELETE FROM world_info_traces
       WHERE project_id = ?
         AND id NOT IN (
           SELECT id FROM world_info_traces
           WHERE project_id = ?
           ORDER BY created_at DESC LIMIT ?
         )`,
    )
    .run(projectId, projectId, keep);
  return Number(res.changes ?? 0);
}

export function deleteAllProjectTraces(db: DB, projectId: string): void {
  db.prepare(`DELETE FROM world_info_traces WHERE project_id = ?`).run(projectId);
}
