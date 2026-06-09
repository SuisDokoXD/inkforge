import { randomUUID } from "node:crypto";
import {
  getAppSettings,
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
import { getAppContext } from "./app-state";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { buildRagBlock } from "./rag-service";
import { triggerChapterSummary } from "./chapter-summary-service";
import { buildVoiceContext } from "./prompt-context/voice-profile-context";

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
      "散文小节要有层次：先交代行踪或触发物，再写可感的景物细节，再落到人的心绪、记忆或顿悟；避免只堆砌形容词。",
      "学习中国文学的气息，但不要仿写具体作家的原句：可取汪曾祺的清淡、沈从文的水气、郁达夫的行旅情绪、古典山水文的留白与节制。",
      "正文长度建议 1500-2500 字。",
      "禁止任何分析、说明、章末总结之类的元文字。",
    ].join("\n"),
    user: [
      args.voiceBlock || "",
      args.ragBlock || "",
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
    const mode = getAppSettings(ctx.db).sceneRoutingMode;
    if (mode === "basic") {
      const binding = getSceneBinding(ctx.db, "basic", basicKey);
      if (binding?.providerId) {
        providerId = binding.providerId;
        model = model ?? binding.model ?? undefined;
      }
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
}): Promise<{ text: string; durationMs: number; providerId: string }> {
  const start = Date.now();
  const stream = streamText({
    providerRecord: args.providerRecord,
    apiKey: args.apiKey,
    model: args.model ?? args.providerRecord.defaultModel,
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    temperature: 0.85,
    maxTokens: args.maxTokens ?? 3000,
  });
  let acc = "";
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) acc += chunk.textDelta;
    if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  }
  return {
    text: acc.trim(),
    durationMs: Date.now() - start,
    providerId: args.providerRecord.id,
  };
}

function tailOf(text: string, max = 600): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return "…" + trimmed.slice(-max);
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
      prevTail = tailOf(md);
    }
  }

  // RAG: query = card content + master outline tail
  const ragQuery = [cardRow.content, project.masterOutline].filter(Boolean).join("\n").slice(-600);
  const ragBlock = buildRagBlock(project.id, ragQuery);
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
    voiceBlock,
  });

  const count = Math.min(3, Math.max(1, input.candidates ?? 1));
  const calls = Array.from({ length: count }, () =>
    streamCollect({
      providerRecord,
      apiKey,
      model,
      systemPrompt: system,
      userMessage: user,
      maxTokens: input.maxTokens ?? 3000,
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

function countGraphemes(text: string): number {
  // Lightweight grapheme count: codepoints excluding whitespace.
  return Array.from(text).filter((c) => /\S/.test(c)).length;
}

export function commitChapterDraft(input: ChapterCommitDraftInput): ChapterCommitDraftResponse {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");

  const title = input.title.trim() || "AI 生成章节";
  const md = `# ${title}\n\n${input.text.trim()}\n`;
  const wordCount = countGraphemes(input.text);

  let chapterId = input.chapterId;
  let filePath: string;

  if (chapterId) {
    // Overwrite existing chapter
    const existing = getChapter(ctx.db, chapterId);
    if (!existing) throw new Error("chapter_not_found");
    if (existing.projectId !== project.id) throw new Error("cross_project_chapter");
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
