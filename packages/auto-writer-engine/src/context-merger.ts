import type {
  AutoWriterCorrectionEntry,
  NovelCharacterRecord,
  WorldEntryRecord,
} from "@inkforge/shared";
import { AGENT_SYSTEM_PROMPTS, rosterToText, worldToText } from "./agent-roles";
import type { StyleSampleRef } from "./types";

/**
 * 把多份资料拼装成一次 LLM 调用的 user prompt。
 * 共享上下文 = chapterTitle + 已写正文摘要 + 人物档案 + 世界观 + 上一段 critic + 用户介入
 *           + 全局世界观（v20）+ 前情提要（v20）+ 文风样本（v20）。
 */

/** v20: 共享的「书级上下文」字段。Planner / Writer / Critic 都吃这块。 */
interface SharedBookContext {
  globalWorldview?: string;
  previousChaptersText?: string;
  styleSamples?: StyleSampleRef[];
  voiceBlock?: string;
  detailLevel?: "full" | "compact";
}

function appendSharedBookContext(lines: string[], ctx: SharedBookContext): void {
  const compact = ctx.detailLevel === "compact";
  if (ctx.voiceBlock && ctx.voiceBlock.trim()) {
    lines.push(`# 写作声音档案\n${ctx.voiceBlock.trim()}`);
  }
  if (ctx.globalWorldview && ctx.globalWorldview.trim()) {
    const text = compact
      ? truncateForContext(ctx.globalWorldview.trim(), 900)
      : ctx.globalWorldview.trim();
    lines.push(`# 本书世界观（全局）\n${text}`);
  }
  if (ctx.previousChaptersText && ctx.previousChaptersText.trim()) {
    const text = compact
      ? truncateForContext(ctx.previousChaptersText.trim(), 1800)
      : ctx.previousChaptersText.trim();
    lines.push(`# 前情提要（已写章节摘要）\n${text}`);
  }
  if (ctx.styleSamples && ctx.styleSamples.length > 0) {
    const body = ctx.styleSamples
      .slice(0, compact ? 2 : 5)
      .map((s, i) => {
        const maxExcerpt = compact ? 280 : 600;
        return `【样本 ${i + 1}｜${s.source}】\n${s.excerpt.slice(0, maxExcerpt)}`;
      })
      .join("\n\n");
    lines.push(`# 文笔参考样本（学习句式与意象密度，禁止照搬词组）\n${body}`);
  }
}

export interface BuildPlannerPromptInput extends SharedBookContext {
  userIdeas: string;
  chapterTitle: string;
  existingChapterText: string;
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
  maxSegments: number;
  recentCorrections: AutoWriterCorrectionEntry[];
}

export function buildPlannerSystem(): string {
  return AGENT_SYSTEM_PROMPTS.planner;
}

export function buildPlannerUser(input: BuildPlannerPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 章节标题\n${input.chapterTitle || "（未命名）"}`);
  lines.push(`# 段数上限\n${input.maxSegments}`);
  lines.push(`# 用户思路\n${input.userIdeas || "（无）"}`);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新补充/纠错\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  if (input.existingChapterText.trim()) {
    lines.push(
      `# 章节已有正文（续写起点）\n${truncateForContext(input.existingChapterText, 1500)}`,
    );
  }
  appendSharedBookContext(lines, input);
  lines.push(`# 人物档案\n${rosterToText(input.characters)}`);
  lines.push(`# 世界观\n${worldToText(input.worldEntries)}`);
  return lines.join("\n\n");
}

export interface BuildWriterPromptInput extends SharedBookContext {
  beat: string;
  segmentIndex: number;
  targetLength: number;
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
  /** 章节当前累积内容（含先前段落） */
  chapterSoFar: string;
  /** 上一段 Critic 输出（如有） */
  lastCriticFindingsText: string | null;
  /** 上一段 Reflector 备忘 */
  reflectorMemo: string | null;
  /** 用户中途介入消息 */
  userInterrupts: AutoWriterCorrectionEntry[];
  /** 是否是回炉重写：本段 lastSegmentText 提供上一次写出的版本 */
  rewriteOf: string | null;
}

export function buildWriterSystem(targetLength: number): string {
  return AGENT_SYSTEM_PROMPTS.writer.replace(
    "{{TARGET_LENGTH}}",
    String(targetLength),
  );
}

export function buildWriterUser(input: BuildWriterPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 本段 Beat（第 ${input.segmentIndex + 1} 段）\n${input.beat}`);
  lines.push(`# 期望长度\n约 ${input.targetLength} 字`);

  if (input.chapterSoFar.trim()) {
    lines.push(`# 章节已写部分\n${truncateForContext(input.chapterSoFar, 1200)}`);
  }

  if (input.userInterrupts.length > 0) {
    lines.push(
      `# 用户最新指示（必须遵循）\n` +
        input.userInterrupts.map((c) => `- ${c.content}`).join("\n"),
    );
  }

  if (input.lastCriticFindingsText) {
    lines.push(`# 上一段审稿意见\n${input.lastCriticFindingsText}`);
  }
  if (input.reflectorMemo) {
    lines.push(`# 反思者备忘\n${input.reflectorMemo}`);
  }
  if (input.rewriteOf) {
    lines.push(
      `# 你上次写的版本（不通过审查，请重写）\n${truncateForContext(input.rewriteOf, 800)}`,
    );
  }

  appendSharedBookContext(lines, { ...input, detailLevel: "compact" });
  lines.push(`# 人物档案\n${rosterToText(input.characters)}`);
  lines.push(`# 世界观\n${worldToText(input.worldEntries)}`);
  return lines.join("\n\n");
}

export function buildCriticSystem(): string {
  return AGENT_SYSTEM_PROMPTS.critic;
}

export interface BuildCriticPromptInput extends SharedBookContext {
  segmentText: string;
  segmentIndex: number;
  beat: string;
  userIdeas: string;
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
  recentCorrections: AutoWriterCorrectionEntry[];
}

export function buildCriticUser(input: BuildCriticPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 待审段落（第 ${input.segmentIndex + 1} 段）\n${input.segmentText}`);
  lines.push(`# 该段 Beat\n${input.beat}`);
  lines.push(`# 用户初始思路\n${input.userIdeas || "（无）"}`);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新指示\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  appendSharedBookContext(lines, { ...input, detailLevel: "compact" });
  lines.push(`# 人物档案（摘要）\n${truncateForContext(rosterToText(input.characters), 1200)}`);
  lines.push(`# 世界观（摘要）\n${truncateForContext(worldToText(input.worldEntries), 1000)}`);
  return lines.join("\n\n");
}

export function buildReflectorSystem(): string {
  return AGENT_SYSTEM_PROMPTS.reflector;
}

export interface BuildReflectorPromptInput extends SharedBookContext {
  segmentText: string;
  segmentIndex: number;
  criticFindingsText: string;
  recentCorrections: AutoWriterCorrectionEntry[];
}

export function buildReflectorUser(input: BuildReflectorPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 本段（第 ${input.segmentIndex + 1} 段）\n${input.segmentText}`);
  lines.push(`# 审稿人 findings\n${input.criticFindingsText || "（通过）"}`);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新指示\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  appendSharedBookContext(lines, { ...input, detailLevel: "compact" });
  return lines.join("\n\n");
}

function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…（前文省略 ${text.length - maxChars} 字）…\n${text.slice(-maxChars)}`;
}
