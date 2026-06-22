import type {
  AutoWriterCorrectionEntry,
  NovelCharacterRecord,
  WorldEntryRecord,
} from "@inkforge/shared";
import { AGENT_SYSTEM_PROMPTS, rosterToText, worldToText } from "./agent-roles";
import { chapterQualityFindingsToMarkdown } from "./chapter-quality";
import { renderPlotCommitmentsBlock } from "./plot-commitments";
import {
  renderPromptConstraintBlock,
  type PromptConstraintSet,
} from "./prompt-constraints";
import type { ChapterQualityFinding, PlotCommitment, StyleSampleRef } from "./types";

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
  promptConstraints?: PromptConstraintSet;
  plotCommitments?: PlotCommitment[];
}

export interface BookDiagnosisChapterInput {
  title: string;
  summary?: string;
  excerpt?: string;
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
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    heading: "# 写作约束清单（Planner 必须分配进 beats）",
  });
  if (constraintBlock) {
    lines.push(
      `${constraintBlock}\nPlanner 要把全局必写词条分配进具体 beat；禁止词条只作为避让约束，不要写进正文计划。`,
    );
  }
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 剧情承诺/伏笔清单（Planner 分配或避让）",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
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
  userIdeas: string;
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
  lines.push(`# 用户原始写作简报（硬性约束以此为准）\n${input.userIdeas || "（无）"}`);
  lines.push(`# 本段 Beat（第 ${input.segmentIndex + 1} 段）\n${input.beat}`);
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    currentText: input.beat,
    heading: "# 写作约束清单（Writer 必须执行）",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 剧情承诺/伏笔清单（Writer 按本段 beat 执行）",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
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
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    currentText: input.beat,
    heading: "# 写作约束清单（Critic 按 error 判定硬性违反）",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 剧情承诺/伏笔清单（Critic 按语义检查）",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
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
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    heading: "# 写作约束摘要（Reflector 给下一段继续保持）",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 剧情承诺/伏笔摘要（Reflector 给下一段继续保持）",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新指示\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  appendSharedBookContext(lines, { ...input, detailLevel: "compact" });
  return lines.join("\n\n");
}

export function buildChapterFactCheckSystem(): string {
  return [
    "你是「章节事实核查员」。你只检查整章完成稿里的客观事实、前后衔接、人物/世界观一致性和用户硬性约束。",
    "不要因为文笔偏好、句子不够漂亮、节奏可优化而给 error；这类问题最多是 warn 或 info。",
    "",
    "输出要求：仅输出一个 JSON 对象，不要 Markdown 代码块、不要解释文字。",
    "对象格式：",
    '{"result":"PASS|FAIL","issues":[{"severity":"info|warn|error","category":"fact|timeline|character|world|constraint|plot-boundary|foreshadow|style","excerpt":"<相关原文，≤120字>","suggestion":"<具体复核或修改建议，≤180字>"}]}',
    "当且仅当存在客观矛盾、硬性要求漏执行、禁止项误出现、剧情边界被突破时，使用 error 并把 result 设为 FAIL。",
    "没有问题时输出：{\"result\":\"PASS\",\"issues\":[]}",
  ].join("\n");
}

export interface BuildChapterFactCheckPromptInput extends SharedBookContext {
  chapterTitle: string;
  userIdeas: string;
  chapterText: string;
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
  recentCorrections: AutoWriterCorrectionEntry[];
}

export function buildChapterFactCheckUser(
  input: BuildChapterFactCheckPromptInput,
): string {
  const lines: string[] = [];
  lines.push(`# 章节标题\n${input.chapterTitle || "（未命名）"}`);
  lines.push(`# 用户原始写作要求\n${input.userIdeas || "（无）"}`);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新补充/修正\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    heading: "# 写作约束清单（章节级检查按硬性规则判定）",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 剧情承诺/伏笔清单（章节级检查按语义判定）",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
  appendSharedBookContext(lines, input);
  lines.push(`# 人物档案\n${truncateForContext(rosterToText(input.characters), 2000)}`);
  lines.push(`# 世界观\n${truncateForContext(worldToText(input.worldEntries), 1800)}`);
  lines.push(`# 待检查章节全文\n${truncateForContext(input.chapterText, 9000)}`);
  lines.push(
    [
      "# 检查边界",
      "- 只核查客观事实、人物/世界观一致性、前情衔接、用户硬性约束、明确剧情边界。",
      "- 必写词漏写、禁止词出现、用户说“不能/不得/不要”的边界被突破，必须给 error。",
      "- 承诺项包括伏笔、回收、揭示和避免提前揭示；只在明显违背用户意图时给 error。",
      "- 文风、节奏、意象密度、语言细节只作为 warn/info，除非直接违反用户硬性风格要求。",
    ].join("\n"),
  );
  return lines.join("\n\n");
}

export function buildWritingConflictSystem(): string {
  return [
    "你是「写作冲突分析员」。当章节级检查失败时，你负责判断失败根因来自哪里，以及是否可通过补充写作约束继续生成。",
    "你不重写正文，不生成新段落，不给泛泛的文笔建议；只做原因分流和下一步建议。",
    "",
    "输出要求：仅输出一个 JSON 对象，不要 Markdown 代码块、不要解释文字。",
    "对象格式：",
    '{"reconcilable":true,"summary":"<≤180字的根因摘要>","rootCause":"outline-history|constraint-history|world-history|foreshadow-outline|mixed|other","extraConstraints":"<如果可调和，给下一次生成可直接使用的补充约束；否则留空>","suggestedActions":[{"id":"edit-outline|adjust-constraints|retry|keep-draft","label":"<用户可读动作>","description":"<动作说明>"}]}',
    "如果问题来自大纲/前情/世界观本身互相矛盾，reconcilable=false，并优先建议 edit-outline 或 adjust-constraints。",
    "如果只是本次生成没有执行清楚的硬性要求，reconcilable=true，并建议 retry，同时给出 extraConstraints。",
  ].join("\n");
}

export interface BuildWritingConflictPromptInput extends SharedBookContext {
  chapterTitle: string;
  userIdeas: string;
  chapterText: string;
  chapterFindings: ChapterQualityFinding[];
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
  recentCorrections: AutoWriterCorrectionEntry[];
}

export function buildWritingConflictUser(input: BuildWritingConflictPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 章节标题\n${input.chapterTitle || "（未命名）"}`);
  lines.push(`# 用户原始写作要求\n${input.userIdeas || "（无）"}`);
  if (input.recentCorrections.length > 0) {
    lines.push(
      `# 用户最新补充/修正\n` +
        input.recentCorrections.map((c) => `- ${c.content}`).join("\n"),
    );
  }
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    heading: "# 写作约束清单",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(input.plotCommitments);
  if (commitmentBlock) lines.push(commitmentBlock);
  lines.push(`# 章节检查问题\n${chapterQualityFindingsToMarkdown(input.chapterFindings)}`);
  appendSharedBookContext(lines, input);
  lines.push(`# 人物档案\n${truncateForContext(rosterToText(input.characters), 1800)}`);
  lines.push(`# 世界观\n${truncateForContext(worldToText(input.worldEntries), 1600)}`);
  lines.push(`# 当前章节全文\n${truncateForContext(input.chapterText, 7000)}`);
  lines.push(
    [
      "# 分析要求",
      "- 判断问题主要是生成执行失败，还是用户要求/大纲/前情/世界观之间存在冲突。",
      "- 不要输出改写正文；只输出根因、是否可调和、补充约束和下一步动作。",
      "- 动作必须从 edit-outline、adjust-constraints、retry、keep-draft 中选择。",
    ].join("\n"),
  );
  return lines.join("\n\n");
}

export function buildBookDiagnosisSystem(): string {
  return [
    "你是「全书诊断员」。你只做整本书层面的结构、节奏、人物弧光、世界观、时间线、伏笔和文风一致性诊断。",
    "你不改写正文，不生成新章节，不做营销评价；只输出问题和修改工单。",
    "",
    "输出要求：仅输出一个 JSON 对象，不要 Markdown 代码块、不要解释文字。",
    "对象格式：",
    '{"status":"pass|review|fail","summary":"<≤220字总评>","findings":[{"severity":"info|warn|error","category":"structure|pacing|character|world|timeline|foreshadow|style|continuity","scope":"<章节或全书范围>","evidence":"<依据，≤160字>","recommendation":"<建议，≤180字>"}],"revisionTasks":[{"priority":"P0|P1|P2","chapterHint":"<章节或范围>","action":"<具体修改动作>","reason":"<为什么要改>"}]}',
    "P0 只用于硬伤：设定/时间线/人物动机矛盾、伏笔严重失约、主线断裂。",
    "P1 用于影响阅读体验的问题：节奏失衡、人物弧光薄弱、章间衔接不清。",
    "P2 用于润色和增强项。",
  ].join("\n");
}

export interface BuildBookDiagnosisPromptInput extends SharedBookContext {
  bookTitle: string;
  userGoal?: string;
  chapters: BookDiagnosisChapterInput[];
  characters: NovelCharacterRecord[];
  worldEntries: WorldEntryRecord[];
}

export function buildBookDiagnosisUser(input: BuildBookDiagnosisPromptInput): string {
  const lines: string[] = [];
  lines.push(`# 作品名称\n${input.bookTitle || "（未命名）"}`);
  if (input.userGoal && input.userGoal.trim()) {
    lines.push(`# 用户目标\n${input.userGoal.trim()}`);
  }
  const constraintBlock = renderPromptConstraintBlock(input.promptConstraints, {
    heading: "# 全书约束清单",
  });
  if (constraintBlock) lines.push(constraintBlock);
  const commitmentBlock = renderPlotCommitmentsBlock(
    input.plotCommitments,
    "# 全书剧情承诺/伏笔清单",
  );
  if (commitmentBlock) lines.push(commitmentBlock);
  appendSharedBookContext(lines, input);
  lines.push(`# 人物档案\n${truncateForContext(rosterToText(input.characters), 2600)}`);
  lines.push(`# 世界观\n${truncateForContext(worldToText(input.worldEntries), 2400)}`);
  if (input.chapters.length === 0) {
    lines.push("# 章节资料\n（无章节资料）");
  } else {
    const chapterText = input.chapters
      .map((chapter, index) => {
        const parts = [`## 第 ${index + 1} 章：${chapter.title || "（未命名）"}`];
        if (chapter.summary?.trim()) {
          parts.push(`摘要：${truncateForContext(chapter.summary.trim(), 900)}`);
        }
        if (chapter.excerpt?.trim()) {
          parts.push(`片段：${truncateForContext(chapter.excerpt.trim(), 1200)}`);
        }
        return parts.join("\n");
      })
      .join("\n\n");
    lines.push(`# 章节资料\n${chapterText}`);
  }
  lines.push(
    [
      "# 诊断边界",
      "- 只输出结构化诊断和修改工单，不输出改写正文。",
      "- 将硬伤与可优化项分开；不要把个人文风偏好升级成 P0。",
      "- 修改工单要能被后续章节级修订直接执行。",
    ].join("\n"),
  );
  return lines.join("\n\n");
}

function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…（前文省略 ${text.length - maxChars} 字）…\n${text.slice(-maxChars)}`;
}
