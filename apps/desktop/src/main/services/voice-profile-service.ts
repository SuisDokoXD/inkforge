// =============================================================================
// Voice Profile（写作声音档案）服务层
// =============================================================================
// 把"问卷答案 → InkForge 风格 promptBlock"渲染逻辑收敛在这里。
// 渲染产物供所有 AI 生成场景注入到 system prompt，避免 LLM 用通用 GPT 口吻写小说。
//
// 答案 K 推荐集（renderer 那边的问卷字段也应对齐）：
//   sentence_rhythm        —— 短促 / 中等 / 偏长
//   voice_register         —— 口语 / 中性 / 文雅 / 文白参半
//   dialogue_density       —— 几乎没有对话 / 平衡 / 偏多
//   pov                    —— 第一人称 / 第三人称限制 / 第三人称全知
//   tense                  —— 现在时为主 / 过去时为主
//   sensory_focus          —— 视觉 / 听觉 / 嗅觉 / 触觉 / 多元
//   description_density    —— 极简 / 中等 / 浓墨重彩
//   emotional_temperature  —— 冷峻 / 温和 / 热烈
//   metaphor_style         —— 极少用比喻 / 常规比喻 / 大量原创比喻
//   forbidden_words        —— 自由文本，逗号分隔
//   loved_words            —— 自由文本，逗号分隔
//   inspiration_authors    —— 自由文本，逗号分隔（"参考某某的笔调"）
//
// 调用方传未知 key 也会被收纳，promptBlock 只会展示已知字段。
// =============================================================================

import {
  deleteVoiceProfile as deleteVoiceProfileRepo,
  getVoiceProfileByProject,
  setVoiceProfileEnabled as setEnabledRepo,
  upsertVoiceProfile as upsertVoiceProfileRepo,
} from "@inkforge/storage";
import type { VoiceProfileRecord } from "@inkforge/shared";

import { getAppContext } from "./app-state";

// 已知问卷字段的中文标签。未知字段会被忽略不展示。
const FIELD_LABELS: Record<string, string> = {
  sentence_rhythm: "句子节奏",
  voice_register: "语体登记",
  dialogue_density: "对话密度",
  pov: "视点",
  tense: "时态",
  sensory_focus: "感官焦点",
  description_density: "描写密度",
  emotional_temperature: "情感温度",
  metaphor_style: "比喻习惯",
  forbidden_words: "禁用词",
  loved_words: "偏爱词",
  inspiration_authors: "参考笔调",
};

// 渲染 promptBlock：把答案模板化成一段可直接拼到 system prompt 的中文段。
// 空答案字段自动跳过；产物在 1-3 句长度内，避免吃掉太多 token。
export function renderVoicePromptBlock(answers: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const v = (answers[key] ?? "").trim();
    if (!v) continue;
    lines.push(`- ${label}：${v}`);
  }
  if (lines.length === 0) return "";
  return `【写作声音档案】（请严格保持以下风格特征）\n${lines.join("\n")}`;
}

// 主入口：upsert，renderer 不传 promptBlock 时由本方法自动渲染。
export function upsertVoiceProfile(input: {
  id: string;
  projectId: string;
  answers: Record<string, string>;
  promptBlock?: string;
  enabled?: boolean;
  completedAt?: string | null;
}): VoiceProfileRecord {
  const ctx = getAppContext();
  const promptBlock =
    input.promptBlock !== undefined
      ? input.promptBlock
      : renderVoicePromptBlock(input.answers);
  return upsertVoiceProfileRepo(ctx.db, {
    id: input.id,
    projectId: input.projectId,
    answers: input.answers,
    promptBlock,
    enabled: input.enabled,
    completedAt: input.completedAt,
  });
}

export function getVoiceProfile(projectId: string): VoiceProfileRecord | null {
  return getVoiceProfileByProject(getAppContext().db, projectId);
}

export function setVoiceProfileEnabled(
  projectId: string,
  enabled: boolean,
): void {
  setEnabledRepo(getAppContext().db, projectId, enabled);
}

export function deleteVoiceProfile(projectId: string): void {
  deleteVoiceProfileRepo(getAppContext().db, projectId);
}

// 给 AI 调用方用的便捷函数：拿"已启用的 voice profile.promptBlock"，
// 没有就返回空字符串。用在 prompt-context 拼装阶段。
export function getActiveVoicePromptBlock(projectId: string): string {
  const profile = getVoiceProfile(projectId);
  if (!profile || !profile.enabled) return "";
  return profile.promptBlock ?? "";
}
