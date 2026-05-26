// =============================================================================
// Voice Profile（写作声音档案）数据访问层
// =============================================================================
// 一项目一条（DB UNIQUE 约束）。结构上：
//   - answers：问卷原始 K/V（如 sentence_rhythm/voice_register/dialogue_density 等）
//   - promptBlock：把 answers 模板渲染后的注入文本，每次调 AI 时拼进 system prompt
//   - enabled：临时关闭（不删数据）
//   - completedAt：用户完成问卷的时间；为 null 表示草稿态
//
// 写路径：upsert（INSERT … ON CONFLICT(project_id) DO UPDATE …）
// =============================================================================

import type { DB } from "../db";
import type { VoiceProfileRecord } from "@inkforge/shared";

type VoiceProfileRow = {
  id: string;
  project_id: string;
  answers: string;
  prompt_block: string;
  enabled: number;
  completed_at: string | null;
  updated_at: string;
};

// 把 answers JSON 字符串解成 Record<string,string>；坏数据回退空对象。
function parseAnswers(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = String(v ?? "");
      return out;
    }
  } catch {
    /* fallthrough */
  }
  return {};
}

function rowToRecord(row: VoiceProfileRow): VoiceProfileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    answers: parseAnswers(row.answers),
    promptBlock: row.prompt_block,
    enabled: row.enabled === 1,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertVoiceProfileInput {
  id: string;             // 调用方生成（建议 `voice-${projectId}` 便于追溯）
  projectId: string;
  answers: Record<string, string>;
  promptBlock: string;    // 调用方负责渲染（voice-profile-service 的职责）
  enabled?: boolean;
  completedAt?: string | null;
}

// 一项目一条。UNIQUE(project_id) 约束触发 ON CONFLICT 走 UPDATE 分支，
// 业务上等价于"有就更新、没就插入"。
export function upsertVoiceProfile(
  db: DB,
  input: UpsertVoiceProfileInput,
): VoiceProfileRecord {
  const now = new Date().toISOString();
  const row: VoiceProfileRow = {
    id: input.id,
    project_id: input.projectId,
    answers: JSON.stringify(input.answers ?? {}),
    prompt_block: input.promptBlock,
    enabled: input.enabled === false ? 0 : 1,
    completed_at: input.completedAt ?? null,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO voice_profiles
       (id, project_id, answers, prompt_block, enabled, completed_at, updated_at)
     VALUES (@id, @project_id, @answers, @prompt_block, @enabled, @completed_at, @updated_at)
     ON CONFLICT(project_id) DO UPDATE SET
       answers      = excluded.answers,
       prompt_block = excluded.prompt_block,
       enabled      = excluded.enabled,
       completed_at = excluded.completed_at,
       updated_at   = excluded.updated_at`,
  ).run(row);
  // ON CONFLICT 路径不返回新插入的 id；按 project_id 重读一次拿到权威记录。
  return getVoiceProfileByProject(db, input.projectId)!;
}

export function getVoiceProfileByProject(
  db: DB,
  projectId: string,
): VoiceProfileRecord | null {
  const row = db
    .prepare(`SELECT * FROM voice_profiles WHERE project_id = ?`)
    .get(projectId) as VoiceProfileRow | undefined;
  return row ? rowToRecord(row) : null;
}

// 只切换 enabled，不触发 promptBlock 重算（避免 UI 滑动开关一次重渲整段 prompt）。
export function setVoiceProfileEnabled(
  db: DB,
  projectId: string,
  enabled: boolean,
): void {
  db.prepare(
    `UPDATE voice_profiles SET enabled = ?, updated_at = ? WHERE project_id = ?`,
  ).run(enabled ? 1 : 0, new Date().toISOString(), projectId);
}

export function deleteVoiceProfile(db: DB, projectId: string): void {
  db.prepare(`DELETE FROM voice_profiles WHERE project_id = ?`).run(projectId);
}
