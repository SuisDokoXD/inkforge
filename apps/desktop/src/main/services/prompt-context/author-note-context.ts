// =============================================================================
// Prompt 上下文 · Author's Note 注入装配
// =============================================================================
// 把"取项目 note → 按 position 拆成 before/after 块"从 skill-service 抽出。
//
// 目的同 world-info-context.ts：
//   - skill-service 不再直接读 storage
//   - autoWriter / chat 等其他服务需要时 import 即可
//   - 任何异常吞掉返回空块，不阻塞
// =============================================================================

import { getAuthorNoteByProject } from "@inkforge/storage";
import type { DB } from "@inkforge/storage";
import { logger } from "../logger";

export interface BuildAuthorNoteContextInput {
  db: DB;
  projectId: string;
}

export interface AuthorNoteContextResult {
  before: string;
  after: string;
}

const EMPTY: AuthorNoteContextResult = { before: "", after: "" };
const HEADER = "【作者批注】";

export function buildAuthorNoteContext(
  input: BuildAuthorNoteContextInput,
): AuthorNoteContextResult {
  try {
    const note = getAuthorNoteByProject(input.db, input.projectId);
    if (!note || !note.enabled || note.text.trim().length === 0) return EMPTY;
    const wrapped = `${HEADER}\n${note.text.trim()}`;
    return note.position === "after"
      ? { before: "", after: wrapped }
      : { before: wrapped, after: "" };
  } catch (err) {
    logger.warn(
      `author-note load failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return EMPTY;
  }
}
