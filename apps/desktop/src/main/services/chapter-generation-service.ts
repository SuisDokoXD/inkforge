import { randomUUID } from "node:crypto";
import {
  getChapter,
  getProject,
  getSceneBinding,
  insertChapter,
  listChapters,
  nextChapterFileName,
  readChapterFile,
  updateChapter,
  updateOutline,
  writeChapterFile,
} from "@inkforge/storage";
import type {
  ChapterCommitDraftInput,
  ChapterCommitDraftResponse,
  ChapterGenerateFromOutlineInput,
  ChapterGenerateFromOutlineResponse,
  SceneKeyBasic,
} from "@inkforge/shared";
import {
  prepareGeneratedChapterDraft,
  tailText,
} from "@inkforge/auto-writer-engine";
import { getAppContext } from "./app-state";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { buildRagBlock, buildSampleReferenceBlock } from "./rag-service";
import { triggerChapterSummary } from "./chapter-summary-service";
import { buildVoiceContext } from "./prompt-context/voice-profile-context";
import { createSnapshot } from "./snapshot-service";

const DEFAULT_CHAPTER_MAX_TOKENS = 6000;
const CONTINUATION_MAX_TOKENS = 2400;
const MAX_CHAPTER_CONTINUATIONS = 2;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

interface ChapterPromptArgs {
  projectName: string;
  genre: string;
  subGenre: string;
  tags: string[];
  masterOutline: string;
  cardTitle: string;
  cardContent: string;
  prevTail: string;
  ragBlock: string;
  sampleReferenceBlock: string;
  voiceBlock: string;
}

function buildChapterPrompt(args: ChapterPromptArgs): { system: string; user: string } {
  const meta = [
    args.genre && `主类：${args.genre}`,
    args.subGenre && `子类：${args.subGenre}`,
    args.tags.length && `标签：${args.tags.join("、")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    system: [
      "你是一位中文小说作者，也熟悉中国现代散文、游记散文与古典山水文章的写法。",
      "输出仅本章正文：可以使用 Markdown 二级小标题（## 小标题）组织段落；不要使用一级标题、代码块或解释性说明。",
      "保持人物口吻与世界观连贯；自然推进情节；避免重复前文已写过的事件细节。",
      "如果本章偏游记、见闻、散文或抒情叙述，请写得更细：分 3-6 个小节，每节有明确的小标题。",
      "禁止连续输出两个同名小标题；同一小节只保留一个 `## 小标题`，不要在下一行或下一段重复。",
      "散文小节要有层次：先交代行踪或触发物，再写可感的景物细节，再落到人的心绪、记忆或顿悟；避免只堆砌形容词。",
      "可以借鉴导入文集里的宏观叙事技法、场景组织、节奏和意象密度，但不要复制原文，也不要复刻任何特定作者的可识别风格。",
      "正文长度建议 1500-2500 字。",
      "禁止任何分析、说明、章末总结之类的元文字。",
    ].join("\n"),
    user: [
      args.voiceBlock || "",
      args.ragBlock || "",
      args.sampleReferenceBlock || "",
      `作品：${args.projectName}`,
      meta,
      "",
      args.masterOutline.trim() ? `总大纲（参考）：\n${args.masterOutline.trim()}\n` : "",
      args.prevTail ? `前文末尾（用作衔接，不要复述）：\n${args.prevTail}\n` : "",
      "",
      `本章纲要：${args.cardTitle}`,
      args.cardContent.trim() || "（空）",
      "",
      "请直接开始写本章正文：",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Provider resolve (basic-mode lookup; main_generation key)
// ---------------------------------------------------------------------------

async function resolveProvider(
  basicKey: SceneKeyBasic,
  explicit: { providerId?: string; model?: string },
): Promise<{
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  model: string | undefined;
}> {
  const ctx = getAppContext();
  let providerId = explicit.providerId;
  let model = explicit.model;
  if (!providerId) {
    const binding = getSceneBinding(ctx.db, "basic", basicKey);
    if (binding?.providerId) {
      providerId = binding.providerId;
      model = model ?? binding.model ?? undefined;
    }
  }
  const providerRecord = resolveProviderRecord(providerId);
  if (!providerRecord) throw new Error("provider_not_configured");
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) throw new Error("api_key_missing");
  return { providerRecord, apiKey, model };
}

async function streamCollect(args: {
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; durationMs: number; providerId: string; finishReason?: string }> {
  const start = Date.now();
  const stream = streamText({
    providerRecord: args.providerRecord,
    apiKey: args.apiKey,
    model: args.model ?? args.providerRecord.defaultModel,
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    temperature: args.temperature ?? 0.85,
    maxTokens: args.maxTokens ?? DEFAULT_CHAPTER_MAX_TOKENS,
  });
  let acc = "";
  let finishReason: string | undefined;
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) acc += chunk.textDelta;
    if (chunk.type === "done" && chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  }
  return {
    text: acc.trim(),
    durationMs: Date.now() - start,
    providerId: args.providerRecord.id,
    finishReason,
  };
}

export function isTokenLimitFinish(reason: string | undefined): boolean {
  return /length|max.?token|token.?limit/i.test(reason ?? "");
}

export function looksAbruptlyCutOff(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 120) return false;
  const tail = trimmed.replace(/[\s#*_`>]+$/g, "");
  if (!tail) return false;
  if (/[。！？!?…」』”）\]】.]$/.test(tail)) return false;
  return /[\u3400-\u9fffA-Za-z0-9，,、：:；;—-]$/.test(tail);
}

export function shouldContinueChapterDraft(result: { text: string; finishReason?: string }): boolean {
  if (!result.text.trim()) return false;
  return isTokenLimitFinish(result.finishReason) || looksAbruptlyCutOff(result.text);
}

function joinContinuation(base: string, continuation: string): string {
  const left = base.trimEnd();
  const right = continuation.trimStart();
  if (!left) return right;
  if (!right) return left;
  return /[。！？!?」』”）\]】…]$/.test(left) ? `${left}\n\n${right}` : `${left}${right}`;
}

async function generateCandidate(args: {
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  model: string | undefined;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; durationMs: number; providerId: string }> {
  const first = await streamCollect({
    providerRecord: args.providerRecord,
    apiKey: args.apiKey,
    model: args.model,
    systemPrompt: args.system,
    userMessage: args.user,
    maxTokens: args.maxTokens,
  });
  if (!shouldContinueChapterDraft(first)) {
    return first;
  }

  let text = first.text;
  let durationMs = first.durationMs;
  for (let i = 0; i < MAX_CHAPTER_CONTINUATIONS; i += 1) {
    const continuation = await streamCollect({
      providerRecord: args.providerRecord,
      apiKey: args.apiKey,
      model: args.model,
      systemPrompt: [
        args.system,
        "",
        "上一轮正文还没有完整收束。现在只补完后续正文：不要重复已写内容，不要重写标题，不要解释原因。",
      ].join("\n"),
      userMessage: [
        args.user,
        "",
        "已写正文末尾：",
        text.slice(-1800),
        "",
        "请从最后一句自然接上，把本章写到完整收束。只输出续写正文。",
      ].join("\n"),
      temperature: 0.75,
      maxTokens: CONTINUATION_MAX_TOKENS,
    });
    text = joinContinuation(text, continuation.text);
    durationMs += continuation.durationMs;
    if (!shouldContinueChapterDraft({ text, finishReason: continuation.finishReason })) break;
  }

  return {
    text,
    durationMs,
    providerId: first.providerId,
  };
}

// ---------------------------------------------------------------------------
// generateChapterFromOutline (multi-candidate parallel)
// ---------------------------------------------------------------------------

export async function generateChapterFromOutline(
  input: ChapterGenerateFromOutlineInput,
): Promise<ChapterGenerateFromOutlineResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");

  const cardRow = ctx.db
    .prepare(
      `SELECT id, project_id, chapter_id, title, content, status, "order", created_at, updated_at
       FROM outline_cards WHERE id = ?`,
    )
    .get(input.outlineCardId) as
    | {
        id: string;
        project_id: string;
        chapter_id: string | null;
        title: string;
        content: string;
      }
    | undefined;
  if (!cardRow) throw new Error("outline_card_not_found");
  if (cardRow.project_id !== input.projectId) throw new Error("cross_project_card");

  // Optional prev-chapter tail for continuity
  let prevTail = "";
  if (input.prevChapterId) {
    const prev = getChapter(ctx.db, input.prevChapterId);
    if (prev && prev.projectId === project.id) {
      const md = readChapterFile(project.path, prev.filePath);
      prevTail = tailText(md);
    }
  }

  // RAG: keep imported literature references in a separate block so they are not
  // squeezed out by world/character/research hits.
  const ragQuery = [
    project.name,
    project.genre,
    project.subGenre,
    project.tags.join(" "),
    project.synopsis,
    cardRow.title,
    cardRow.content,
    project.masterOutline,
    project.globalWorldview,
    prevTail,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-1200);
  const ragBlock = buildRagBlock(project.id, ragQuery, { sampleChunks: false });
  const sampleReferenceBlock = buildSampleReferenceBlock(project.id, ragQuery, {
    maxHits: 3,
    maxPerEntry: 650,
    maxTotalChars: 2200,
    sampleLibIds: input.sampleLibIds,
  });
  const voiceBlock = buildVoiceContext({
    db: ctx.db,
    projectId: project.id,
  }).before;

  const { providerRecord, apiKey, model } = await resolveProvider("main_generation", {
    providerId: input.providerId,
    model: input.model,
  });
  const { system, user } = buildChapterPrompt({
    projectName: project.name,
    genre: project.genre,
    subGenre: project.subGenre,
    tags: project.tags,
    masterOutline: project.masterOutline,
    cardTitle: cardRow.title,
    cardContent: cardRow.content,
    prevTail,
    ragBlock,
    sampleReferenceBlock,
    voiceBlock,
  });

  const count = Math.min(3, Math.max(1, input.candidates ?? 1));
  const calls = Array.from({ length: count }, () =>
    generateCandidate({
      providerRecord,
      apiKey,
      model,
      system,
      user,
      maxTokens: input.maxTokens ?? DEFAULT_CHAPTER_MAX_TOKENS,
    }),
  );
  const settled = await Promise.allSettled(calls);
  const candidates = settled
    .filter((s): s is PromiseFulfilledResult<{ text: string; durationMs: number; providerId: string }> => s.status === "fulfilled")
    .map((s) => s.value)
    .filter((c) => c.text.length > 0);

  if (candidates.length === 0) {
    const firstReject = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(
      firstReject ? (firstReject.reason instanceof Error ? firstReject.reason.message : String(firstReject.reason)) : "all_candidates_failed",
    );
  }

  return {
    candidates,
    outlineCardId: cardRow.id,
    outlineTitle: cardRow.title,
  };
}

// ---------------------------------------------------------------------------
// commitChapterDraft (write file + insert/update chapter row + link card)
// ---------------------------------------------------------------------------

export function commitChapterDraft(input: ChapterCommitDraftInput): ChapterCommitDraftResponse {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");

  const { title, markdown: md, wordCount } = prepareGeneratedChapterDraft({
    title: input.title,
    text: input.text,
  });

  let chapterId = input.chapterId;
  let filePath: string;

  if (!chapterId && input.outlineCardId) {
    const linked = ctx.db
      .prepare(`SELECT chapter_id FROM outline_cards WHERE id = ? AND project_id = ?`)
      .get(input.outlineCardId, project.id) as { chapter_id: string | null } | undefined;
    if (linked?.chapter_id) {
      const existing = getChapter(ctx.db, linked.chapter_id);
      if (existing && existing.projectId === project.id) {
        chapterId = existing.id;
      }
    }
  }

  if (chapterId) {
    // Overwrite existing chapter
    const existing = getChapter(ctx.db, chapterId);
    if (!existing) throw new Error("chapter_not_found");
    if (existing.projectId !== project.id) throw new Error("cross_project_chapter");
    createSnapshot({
      chapterId: existing.id,
      projectId: project.id,
      kind: "pre-rewrite",
      label: `模型重写前：${existing.title}`,
    });
    filePath = existing.filePath;
    writeChapterFile(project.path, filePath, md);
    updateChapter(ctx.db, { id: chapterId, title, wordCount });
  } else {
    // Create new chapter at end of project
    filePath = nextChapterFileName(project.path, title);
    writeChapterFile(project.path, filePath, md);
    const order = listChapters(ctx.db, project.id).length;
    const record = insertChapter(ctx.db, {
      id: randomUUID(),
      projectId: project.id,
      title,
      order,
      status: "draft",
      wordCount,
      filePath,
    });
    chapterId = record.id;
  }

  // Link outline card to chapter (chapter_id) so user can see it's been written
  if (input.outlineCardId) {
    try {
      updateOutline(ctx.db, {
        id: input.outlineCardId,
        chapterId,
        status: "written",
      });
    } catch {
      // Non-fatal: outline link failure shouldn't block draft commit.
    }
  }

  // v22+: 章节落盘后异步触发摘要生成（不阻塞返回）。失败只 warn。
  // 长篇写到几十章时，AutoWriter 启动会读所有摘要做跨章上下文。
  triggerChapterSummary(chapterId);

  return { chapterId, filePath, wordCount };
}
