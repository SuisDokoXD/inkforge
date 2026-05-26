// =============================================================================
// Prompt 上下文 · Voice Profile（写作声音档案）注入装配
// =============================================================================
// 把"取项目 voice profile → 返回 promptBlock"封装为统一调用，
// 调用方在拼 user message 时只需要把这块字符串塞进去即可。
//
// 与 author-note / world-info / RAG 同模式：
//   - 单一职责，无 I/O 异常都吞掉，返回空字符串
//   - 永远拼到 system 角度的开头（before），让 LLM 第一时间看到风格约束
// =============================================================================

import { getVoiceProfileByProject } from "@inkforge/storage";
import type { DB } from "@inkforge/storage";
import { logger } from "../logger";

export interface BuildVoiceContextInput {
  db: DB;
  projectId: string;
}

export interface VoiceContextResult {
  // 拼到 user message 最前的"写作声音"段落。空 = 用户没启用 / 还没填。
  before: string;
}

const EMPTY: VoiceContextResult = { before: "" };

export function buildVoiceContext(
  input: BuildVoiceContextInput,
): VoiceContextResult {
  try {
    const profile = getVoiceProfileByProject(input.db, input.projectId);
    if (!profile || !profile.enabled) return EMPTY;
    const block = (profile.promptBlock ?? "").trim();
    if (!block) return EMPTY;
    return { before: block };
  } catch (err) {
    logger.warn(
      `voice-profile load failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return EMPTY;
  }
}
