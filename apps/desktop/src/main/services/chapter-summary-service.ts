import {
  getChapter,
  getProject,
  readChapterFile,
  upsertChapterSummary,
  getChapterSummary,
  listChapterSummariesByProject,
  type DB,
} from "@inkforge/storage";
import type {
  ChapterSummaryRecord,
  AppSettings,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { getAppSettings, getSceneBinding } from "@inkforge/storage";
import { resolveProviderRecord, resolveApiKey, streamText } from "./llm-runtime";
import { logger } from "./logger";

/**
 * v22+: 章节摘要服务。
 *
 * 用 `summarize` scene-key 对应的 provider 把章节正文摘成 100~200 字。
 * 摘要的目标是给 AutoWriter 跨章节注入用，所以重点是：
 *   - 谁在哪、做了什么、关键转折、未完成的悬念
 *   - 不要花俏文笔；用条目式或 1-2 句概括
 *
 * 调用约定：
 *   - `ensureChapterSummary` 幂等：若已存在且 sourceWordCount 没变（章节没改）
 *     则直接返回旧的；否则重新生成。
 *   - 失败不抛：摘要是辅助上下文，缺失只是降级，不该把 commitDraft / autoWriter
 *     done 流程拖崩。所有错误吞掉并 logger.warn。
 */

const SUMMARY_PROMPT_SYSTEM = [
  "你是一名小说编辑助手，正在为长篇小说做章节摘要索引。",
  "对给定章节正文，输出 100~200 字的客观摘要，重点描述：",
  "  1) 主要发生地点与时间",
  "  2) 出场人物及其关键动作 / 决定",
  "  3) 章末状态：未完成的冲突、新埋下的悬念、人物去向",
  '禁忌：不要文学加工，不要"本章描写了…"之类的元叙述，不要复述细节，不要给出主观评价。',
  "格式：纯中文段落或 3-5 条短句，全段不超过 200 汉字。",
].join("\n");

function buildSummaryUser(args: {
  chapterTitle: string;
  chapterOrder: number;
  body: string;
}): string {
  // 章节正文太长会顶满 prompt，做一个粗略的字数封顶（前 800 + 后 1200）。
  // 摘要只关心 "这一章发生了啥 + 章末状态"，头尾就够。
  const body = args.body.trim();
  const truncated =
    body.length > 2200
      ? body.slice(0, 800) + "\n\n[…中段省略…]\n\n" + body.slice(-1200)
      : body;
  return [
    `第 ${args.chapterOrder} 章 · ${args.chapterTitle || "(未命名)"}`,
    "",
    "正文：",
    truncated,
    "",
    "请输出该章 100~200 字摘要：",
  ].join("\n");
}

function resolveSummarizeProvider(db: DB, settings: AppSettings):
  | { providerId?: string; model?: string }
  | null {
  if (settings.sceneRoutingMode !== "basic") return null;
  const binding = getSceneBinding(db, "basic", "summarize");
  if (!binding?.providerId) return null;
  return { providerId: binding.providerId, model: binding.model ?? undefined };
}

function countWords(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * 生成或刷新某一章的摘要（幂等）。失败只 warn，不 throw。
 */
export async function ensureChapterSummary(
  chapterId: string,
  options: { force?: boolean } = {},
): Promise<ChapterSummaryRecord | null> {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, chapterId);
  if (!chapter) return null;
  const project = getProject(ctx.db, chapter.projectId);
  if (!project) return null;

  let body = "";
  try {
    body = readChapterFile(project.path, chapter.filePath) ?? "";
  } catch {
    return null;
  }
  body = body.trim();
  if (!body) return null;
  // 太短的章节不值得摘要（200 字以内直接当摘要返回，省 token）
  const wc = countWords(body);

  const existing = getChapterSummary(ctx.db, chapterId);
  if (existing && !options.force && existing.sourceWordCount === wc) {
    return existing;
  }

  if (wc < 200) {
    return upsertChapterSummary(ctx.db, {
      chapterId,
      projectId: project.id,
      summary: body,
      sourceWordCount: wc,
    });
  }

  const settings = getAppSettings(ctx.db);
  const route = resolveSummarizeProvider(ctx.db, settings);
  const providerRecord = resolveProviderRecord(route?.providerId);
  if (!providerRecord) {
    logger.warn("[chapter-summary] no provider configured");
    return existing ?? null;
  }
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) {
    logger.warn("[chapter-summary] no api key");
    return existing ?? null;
  }

  try {
    const stream = streamText({
      providerRecord,
      apiKey,
      model: route?.model ?? providerRecord.defaultModel,
      systemPrompt: SUMMARY_PROMPT_SYSTEM,
      userMessage: buildSummaryUser({
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        body,
      }),
      temperature: 0.3,
      maxTokens: 400,
    });
    let acc = "";
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) acc += chunk.textDelta;
      if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
    }
    const text = acc.trim();
    if (!text) return existing ?? null;
    return upsertChapterSummary(ctx.db, {
      chapterId,
      projectId: project.id,
      summary: text,
      model: route?.model ?? providerRecord.defaultModel,
      providerId: providerRecord.id,
      sourceWordCount: wc,
    });
  } catch (error) {
    logger.warn("[chapter-summary] generate failed", error);
    return existing ?? null;
  }
}

/**
 * Fire-and-forget 触发摘要：调用方不等待，永不抛错。
 * 用于 commitDraft / autoWriter done 等"章节落盘后"hook。
 */
export function triggerChapterSummary(chapterId: string): void {
  void ensureChapterSummary(chapterId).catch(() => undefined);
}

/**
 * 项目维度：列出所有已有摘要（按章节 order 升序）。供 AutoWriter 注入使用。
 */
export function listProjectChapterSummaries(
  projectId: string,
): ChapterSummaryRecord[] {
  const ctx = getAppContext();
  return listChapterSummariesByProject(ctx.db, projectId);
}
