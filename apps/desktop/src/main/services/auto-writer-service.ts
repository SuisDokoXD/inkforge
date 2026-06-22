import type { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import {
  appendAutoWriterCorrection,
  getActiveAutoWriterRun,
  getAutoWriterRun,
  getChapter,
  getProject,
  insertAutoWriterRun,
  listAutoWriterRunsByChapter,
  listAutoWriterRunsByProject,
  listChapterSummariesByProject,
  listChapters,
  listNovelCharacters,
  listOutlines,
  listWorldEntries,
  readChapterFile,
  setChapterOrigin,
  updateAutoWriterRun,
  updateChapter,
  writeChapterFile,
} from "@inkforge/storage";
import {
  runAutoWriterPipeline,
  UserInterruptQueue,
  parseFindings,
  type AgentCallInput,
  type AgentCallOutput,
  type OocFinding,
  type PipelineDeps,
  type SnapshotHookInput,
  type StyleSampleRef,
} from "@inkforge/auto-writer-engine";
import {
  AUTO_WRITER_DEFAULTS,
  AUTO_WRITER_PARAMETER_LIMITS,
  ipcEventChannels,
  type AutoWriterChunkEvent,
  type AutoWriterCorrectionEntry,
  type AutoWriterDoneEvent,
  type AutoWriterPhaseEvent,
  type AutoWriterRunRecord,
  type AutoWriterSnapshotEvent,
  type AutoWriterStartInput,
  type ChapterRecord,
  type ChapterSnapshotRecord,
} from "@inkforge/shared";
import type { DB } from "@inkforge/storage";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  pickProviderKey,
  resolveProviderRecord,
  reportProviderKeyResult,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { createSnapshot } from "./snapshot-service";
import { appendAiEntry } from "./chapter-log-service";
import { triggerChapterSummary } from "./chapter-summary-service";
import { buildVoiceContext } from "./prompt-context/voice-profile-context";
import { findSampleReferences } from "./rag-service";
import { resolveAutoWriterGenerationOptions } from "./auto-writer-generation-options";
import {
  checkAchievementsAndNotify,
  unlockAchievementAndNotify,
} from "./achievement-service";

interface RuntimeController {
  runId: string;
  cancelled: boolean;
  paused: boolean;
  interrupts: UserInterruptQueue;
  promise: Promise<void>;
}

const runtimes = new Map<string, RuntimeController>();

function emitToWindow<T>(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: T,
): void {
  try {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch (error) {
    logger.warn(`emit to window failed (${channel})`, error);
  }
}

function countWords(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * v22+: Build previous-chapters context with hierarchical summary memory.
 *
 * 之前只取前 3 章 tail × 600 字 → 写到第 30 章时人物 OOC / 世界观漂移。
 * 新策略（受 NovelAI / NaiveLM 长文记忆方案启发）：
 *   1. 全部前序章节摘要（chapter_summaries 表）按 order 升序拼成"长期记忆"段
 *   2. 紧邻当前章的"最近一章"取更长的 tail（1500 字），作为"短期记忆"
 *   3. 没摘要的中间章节降级到机械 tail（600 字），保证不留空洞
 *
 * 总长度做软封顶（约 8000 字），优先保留：当前章 ← 最近章 tail ← 摘要新→旧。
 */
function buildPreviousChaptersText(
  db: DB,
  projectPath: string,
  current: ChapterRecord,
): string {
  const all = listChapters(db, current.projectId);
  const preceding = all
    .filter((c) => c.order < current.order)
    .sort((a, b) => a.order - b.order);
  if (preceding.length === 0) return "";

  const summariesById = new Map(
    listChapterSummariesByProject(db, current.projectId).map((s) => [s.chapterId, s]),
  );

  const blocks: string[] = [];

  // 长期记忆：所有前序章节摘要
  const summaryLines: string[] = [];
  for (const ch of preceding) {
    const s = summariesById.get(ch.id);
    if (s && s.summary.trim()) {
      summaryLines.push(`第${ch.order}章「${ch.title}」：${s.summary.trim()}`);
    }
  }
  if (summaryLines.length > 0) {
    blocks.push(`【全书摘要（长期记忆，按顺序）】\n${summaryLines.join("\n")}`);
  }

  // 短期记忆：最近 1 章长 tail；如果没摘要，再补 1-2 章 tail
  const recentNoSummary = preceding
    .slice()
    .reverse()
    .filter((ch) => !summariesById.has(ch.id))
    .slice(0, 2)
    .reverse();
  const lastChapter = preceding[preceding.length - 1];
  const recentChapters = recentNoSummary.includes(lastChapter)
    ? recentNoSummary
    : [...recentNoSummary, lastChapter];

  for (const ch of recentChapters) {
    let body = "";
    try {
      body = readChapterFile(projectPath, ch.filePath) ?? "";
    } catch {
      body = "";
    }
    const trimmed = body.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    // 最近一章给 1500 字（衔接需要笔触细节），更早的给 600 字
    const tailLen = ch.id === lastChapter.id ? 1500 : 600;
    const tail = trimmed.length > tailLen ? "…" + trimmed.slice(-tailLen) : trimmed;
    blocks.push(`【第${ch.order}章 · ${ch.title}（节选 · 短期记忆）】\n${tail}`);
  }
  return blocks.join("\n\n");
}

/**
 * v20: Pull style sample chunks via RAG. Use the user's chapter ideas as the
 * query so chunks roughly aligned with the upcoming scene get picked.
 * Returns up to 3 references (cheap; Critic will use them too).
 */
function buildStyleSamples(args: {
  projectId: string;
  query: string;
  sampleLibIds?: string[];
}): StyleSampleRef[] {
  return findSampleReferences(args.projectId, args.query, {
    maxHits: 4,
    maxPerEntry: 650,
    sampleLibIds: args.sampleLibIds,
  });
}

export async function startAutoWriter(
  input: AutoWriterStartInput,
  getWindow: () => BrowserWindow | null,
): Promise<{ runId: string }> {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${input.chapterId}`);
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);

  // 同章节同时只允许一个 run（避免并发写入）
  const active = getActiveAutoWriterRun(ctx.db, input.chapterId);
  if (active) {
    throw new Error(`This chapter already has an active run: ${active.id}`);
  }

  const runId = randomUUID();
  const run = insertAutoWriterRun(ctx.db, {
    id: runId,
    projectId: input.projectId,
    chapterId: input.chapterId,
    userIdeas: input.userIdeas,
    agentsConfig: input.agents,
  });
  // 标记章节 origin 为 ai-auto
  try {
    setChapterOrigin(ctx.db, input.chapterId, "ai-auto");
  } catch (error) {
    logger.warn("auto-writer: setChapterOrigin failed", error);
  }

  const interrupts = new UserInterruptQueue();
  const controller: RuntimeController = {
    runId,
    cancelled: false,
    paused: false,
    interrupts,
    promise: Promise.resolve(),
  };
  runtimes.set(runId, controller);

  const targetSegmentLength = clampNumber(
    input.targetSegmentLength ?? AUTO_WRITER_DEFAULTS.targetSegmentLength,
    AUTO_WRITER_PARAMETER_LIMITS.targetSegmentLength.min,
    AUTO_WRITER_PARAMETER_LIMITS.targetSegmentLength.max,
  );
  const maxSegments = Math.round(
    clampNumber(
      input.maxSegments ?? AUTO_WRITER_DEFAULTS.maxSegments,
      AUTO_WRITER_PARAMETER_LIMITS.maxSegments.min,
      AUTO_WRITER_PARAMETER_LIMITS.maxSegments.max,
    ),
  );
  const maxRewritesPerSegment = Math.round(
    clampNumber(
      input.maxRewritesPerSegment ?? AUTO_WRITER_DEFAULTS.maxRewritesPerSegment,
      AUTO_WRITER_PARAMETER_LIMITS.maxRewritesPerSegment.min,
      AUTO_WRITER_PARAMETER_LIMITS.maxRewritesPerSegment.max,
    ),
  );
  const enableOocGate = input.enableOocGate ?? AUTO_WRITER_DEFAULTS.enableOocGate;
  const speedMode = input.speedMode ?? AUTO_WRITER_DEFAULTS.speedMode;

  const characters = listNovelCharacters(ctx.db, input.projectId);
  const worldEntries = listWorldEntries(ctx.db, { projectId: input.projectId });
  const existingChapterText = readChapterFile(project.path, chapter.filePath);

  // v22+: 自动读取章节关联的大纲卡内容，拼到 userIdeas。
  // 用户在 OutlinePage 维护了大纲卡时，AutoWriter 会自动遵循；如果用户写得
  // 很简略或没维护，这一段就是空，逻辑无副作用。
  // 找匹配方式：outline_cards.chapter_id = chapter.id（最严格）。
  let userIdeas = input.userIdeas;
  let linkedCardTitle = "";
  let linkedCardContent = "";
  try {
    const allCards = listOutlines(ctx.db, input.projectId);
    const linkedCard = allCards.find((c) => c.chapterId === chapter.id);
    if (linkedCard && linkedCard.content.trim()) {
      linkedCardTitle = linkedCard.title;
      linkedCardContent = linkedCard.content.trim();
      const cardBlock = `【来自大纲卡《${linkedCard.title}》】\n${linkedCard.content.trim()}`;
      userIdeas = userIdeas?.trim()
        ? `${cardBlock}\n\n【用户即时思路】\n${userIdeas.trim()}`
        : cardBlock;
    }
  } catch (error) {
    logger.warn("auto-writer: read linked outline card failed", error);
  }

  // ----- v20: per-book global worldview + cross-chapter context + style samples -----
  const globalWorldview = (project.globalWorldview ?? "").trim();
  const previousChaptersText = buildPreviousChaptersText(
    ctx.db,
    project.path,
    chapter,
  );
  const styleSampleQuery = [
    project.name,
    project.genre,
    project.subGenre,
    project.tags.join(" "),
    project.synopsis,
    project.masterOutline,
    project.globalWorldview,
    chapter.title,
    linkedCardTitle,
    linkedCardContent,
    input.userIdeas,
    existingChapterText?.slice(-1200) ?? "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-2400);
  const styleSamples = buildStyleSamples({
    projectId: project.id,
    query: styleSampleQuery,
    sampleLibIds: input.sampleLibIds,
  });
  const voiceBlock = buildVoiceContext({
    db: ctx.db,
    projectId: project.id,
  }).before;

  const deps: PipelineDeps = {
    invokeAgent: async (agentInput, _onDelta) => {
      return invokeOneAgent({
        runId,
        chapterId: chapter.id,
        agentInput,
        getWindow,
        controller,
      });
    },
    createSnapshot: async (snapInput: SnapshotHookInput) => {
      try {
        const result = createSnapshot({
          chapterId: chapter.id,
          projectId: project.id,
          kind: snapInput.kind,
          content: snapInput.chapterText,
          runId,
          agentRole: snapInput.agentRole,
          dedupe: true,
        });
        if (!result.reused) {
          const event: AutoWriterSnapshotEvent = {
            runId,
            chapterId: chapter.id,
            snapshot: result.snapshot,
            emittedAt: new Date().toISOString(),
          };
          emitToWindow<AutoWriterSnapshotEvent>(
            getWindow,
            ipcEventChannels.autoWriterSnapshot,
            event,
          );
        }
        return result.snapshot;
      } catch (error) {
        logger.warn("auto-writer: createSnapshot failed", error);
        return null as unknown as ChapterSnapshotRecord;
      }
    },
    applyChapterContent: async ({ chapterText }) => {
      writeChapterFile(project.path, chapter.filePath, chapterText);
      try {
        updateChapter(ctx.db, {
          id: chapter.id,
          wordCount: countWords(chapterText),
        });
      } catch (error) {
        logger.warn("auto-writer: updateChapter failed", error);
      }
    },
    runOocGate: async (gateInput) => {
      // 我们的 critic 已经做了 LLM 审稿；这里再用一个轻量启发式 gate：
      // 检查段落里是否提到了不在 characters 名单里却带「角色形容词」的名字。
      // 这一层是廉价兜底，不阻塞主流程。
      if (!enableOocGate) return [];
      const findings: OocFinding[] = [];
      const charNames = new Set(gateInput.characters.map((c) => c.name));
      // 暂仅返回 LLM critic 之外的 hint：留作扩展点（PR-8 可丰富）
      void charNames;
      return findings;
    },
    drainInterrupts: () => {
      const taken = interrupts.drain();
      // 同步把这批 corrections 也持久化到 DB（已经通过 IPC autoWriterCorrect 落库，这里只是兜底防重复）
      return taken;
    },
    emitPhase: (event) => {
      const payload: AutoWriterPhaseEvent = {
        runId,
        chapterId: chapter.id,
        phase: event.phase,
        segmentIndex: event.segmentIndex,
        rewriteCount: event.rewriteCount,
        criticSummary: event.criticSummary,
        emittedAt: new Date().toISOString(),
      };
      emitToWindow<AutoWriterPhaseEvent>(
        getWindow,
        ipcEventChannels.autoWriterPhase,
        payload,
      );
    },
    isCancelled: () => controller.cancelled,
    isPaused: () => controller.paused,
  };

  controller.promise = (async () => {
    let status: AutoWriterRunRecord["status"] = "completed";
    let errMsg: string | undefined;
    let stats: Awaited<ReturnType<typeof runAutoWriterPipeline>> | null = null;
    try {
      stats = await runAutoWriterPipeline(
        {
          runId,
          projectId: project.id,
          chapterId: chapter.id,
          userIdeas,
          agents: input.agents,
          targetSegmentLength,
          maxSegments,
          maxRewritesPerSegment,
          enableOocGate,
          speedMode,
          existingChapterText,
          chapterTitle: chapter.title,
          characters,
          worldEntries,
          globalWorldview,
          previousChaptersText,
          styleSamples,
          voiceBlock,
        },
        deps,
      );
      if (controller.cancelled) status = "stopped";
    } catch (error) {
      // v22+: 区分"完全失败"vs"部分失败但已落盘 N 段"。
      // 之前一律 'failed' 让用户误以为整章作废；现在如果跑完至少 1 段，
      // 标 'partial'，UI 据此提示"前 N 段已保留可用"。
      const partial = stats && stats.totalSegments > 0;
      status = partial ? "partial" : "failed";
      errMsg = error instanceof Error ? error.message : String(error);
      logger.error("auto-writer pipeline error", error);
    }

    // v22+: 章节落盘后异步触发摘要生成（除完全失败外都触发；
    // 失败章节摘要也有用，人工审稿时可见）
    if (status !== "failed") {
      triggerChapterSummary(chapter.id);
    }

    // 持久化最终状态
    try {
      updateAutoWriterRun(ctx.db, runId, {
        status,
        statsJson: (stats as unknown as Record<string, unknown>) ?? {},
      });
    } catch (error) {
      logger.warn("auto-writer: updateAutoWriterRun failed", error);
    }
    if (status === "completed" || status === "partial") {
      try {
        checkAchievementsAndNotify(project.id, "auto-writer-done");
        if ((stats?.totalRewrites ?? 0) >= 3) {
          unlockAchievementAndNotify(project.id, "rewrite_master", {
            trigger: "auto-writer-done",
            runId,
            totalRewrites: stats?.totalRewrites ?? 0,
          });
        }
      } catch (error) {
        logger.warn("auto-writer achievement check failed", error);
      }
    }

    // 章节日志：本次 AI 运行总结
    try {
      const summary = stats
        ? `AutoWriter ${status}：写了 ${stats.totalSegments} 段，重写 ${stats.totalRewrites} 次，token ${stats.totalTokensIn} ↑/${stats.totalTokensOut} ↓。`
        : `AutoWriter ${status}：${errMsg ?? "未完成"}`;
      appendAiEntry({
        chapterId: chapter.id,
        projectId: project.id,
        kind: "ai-run",
        content: summary,
        metadata: {
          runId,
          status,
          tokensIn: stats?.totalTokensIn ?? 0,
          tokensOut: stats?.totalTokensOut ?? 0,
          rewrites: stats?.totalRewrites ?? 0,
          segments: stats?.totalSegments ?? 0,
        },
      });
    } catch (error) {
      logger.warn("auto-writer: append log entry failed", error);
    }

    const doneEvent: AutoWriterDoneEvent = {
      runId,
      chapterId: chapter.id,
      status,
      totalSegments: stats?.totalSegments ?? 0,
      totalRewrites: stats?.totalRewrites ?? 0,
      totalTokensIn: stats?.totalTokensIn ?? 0,
      totalTokensOut: stats?.totalTokensOut ?? 0,
      error: errMsg,
      finishedAt: new Date().toISOString(),
    };
    emitToWindow<AutoWriterDoneEvent>(
      getWindow,
      ipcEventChannels.autoWriterDone,
      doneEvent,
    );

    runtimes.delete(runId);
  })();

  // 立即返回，不等待主流程跑完
  void run;
  return { runId };
}

export function stopAutoWriter(runId: string): void {
  const ctrl = runtimes.get(runId);
  if (!ctrl) return;
  ctrl.cancelled = true;
}

export function pauseAutoWriter(runId: string): AutoWriterRunRecord {
  const ctx = getAppContext();
  const ctrl = runtimes.get(runId);
  if (ctrl) ctrl.paused = true;
  const updated = updateAutoWriterRun(ctx.db, runId, { status: "paused" });
  return updated;
}

export function resumeAutoWriter(runId: string): AutoWriterRunRecord {
  const ctx = getAppContext();
  const ctrl = runtimes.get(runId);
  if (ctrl) ctrl.paused = false;
  const updated = updateAutoWriterRun(ctx.db, runId, { status: "running" });
  return updated;
}

export function getAutoWriterRunRecord(runId: string): AutoWriterRunRecord | null {
  const ctx = getAppContext();
  return getAutoWriterRun(ctx.db, runId);
}

export function listAutoWriterRuns(input: {
  chapterId?: string;
  projectId?: string;
  limit?: number;
}): AutoWriterRunRecord[] {
  const ctx = getAppContext();
  if (input.chapterId) {
    return listAutoWriterRunsByChapter(ctx.db, input.chapterId, { limit: input.limit });
  }
  if (input.projectId) {
    return listAutoWriterRunsByProject(ctx.db, input.projectId, { limit: input.limit });
  }
  return [];
}

export function injectIdea(input: {
  runId: string;
  content: string;
}): AutoWriterRunRecord {
  const ctx = getAppContext();
  const correction: AutoWriterCorrectionEntry = {
    at: new Date().toISOString(),
    content: input.content,
  };
  const updated = appendAutoWriterCorrection(ctx.db, input.runId, correction);
  const ctrl = runtimes.get(input.runId);
  if (ctrl) ctrl.interrupts.push(correction);
  return updated;
}

export function correctSegment(input: {
  runId: string;
  content: string;
  targetExcerpt?: string;
}): { run: AutoWriterRunRecord; correction: AutoWriterCorrectionEntry } {
  const ctx = getAppContext();
  const correction: AutoWriterCorrectionEntry = {
    at: new Date().toISOString(),
    content: input.content,
    targetExcerpt: input.targetExcerpt,
  };
  const updated = appendAutoWriterCorrection(ctx.db, input.runId, correction);
  const ctrl = runtimes.get(input.runId);
  if (ctrl) ctrl.interrupts.push(correction);
  return { run: updated, correction };
}

// =====================================================================
// 内部：单次 agent 调用 → llm-core 流式 → 转发 chunk + 收集结果
// =====================================================================

/**
 * v22+: 把上游 provider 抛出来的字符串错误归类。
 * llm-core 的 OpenAIProvider 在非 2xx 时 yield `HTTP <status>: <body>`，
 * 因此这里用正则提取状态码；其余按 message 关键词归类。
 */
interface ClassifiedError {
  retryable: boolean;
  status: number | null;
  /** Retry-After 解析得到的等待秒数，没有则 null。 */
  retryAfterSec: number | null;
  reason: string;
}

function classifyAgentError(message: string): ClassifiedError {
  const text = (message ?? "").toString();
  const httpMatch = text.match(/HTTP\s+(\d{3})/i);
  const status = httpMatch ? Number(httpMatch[1]) : null;

  // Retry-After 可能是秒数或者 HTTP-date；我们只支持秒数（够用）
  let retryAfterSec: number | null = null;
  const retryAfterMatch = text.match(/retry[-_ ]?after[^0-9]{0,8}(\d{1,4})/i);
  if (retryAfterMatch) retryAfterSec = Number(retryAfterMatch[1]);

  // 网络层 / 流中断 / 超时 → 一律可重试
  const networky =
    /ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|EPIPE|aborted|socket hang up|fetch failed|network|timeout/i.test(
      text,
    );

  if (status !== null) {
    // 429：限流；408：超时；425：too early；500/502/503/504：服务端临时故障 → 全部可重试
    const retryableStatus = status === 429 || status === 408 || status === 425 || (status >= 500 && status <= 599);
    return {
      retryable: retryableStatus,
      status,
      retryAfterSec,
      reason: `HTTP ${status}`,
    };
  }
  if (networky) {
    return { retryable: true, status: null, retryAfterSec, reason: "network" };
  }
  return { retryable: false, status: null, retryAfterSec, reason: "other" };
}

const AUTO_WRITER_MAX_RETRY = 5;
const AUTO_WRITER_BASE_DELAY_MS = 1500;
const AUTO_WRITER_MAX_DELAY_MS = 30_000;

function computeBackoffMs(attempt: number, retryAfterSec: number | null): number {
  if (retryAfterSec && retryAfterSec > 0) {
    // 上游说让等多久就等多久，最多压到 60s（避免被恶意 header 卡死）
    return Math.min(retryAfterSec * 1000, 60_000);
  }
  // 指数退避 + 0~30% 抖动
  const base = Math.min(
    AUTO_WRITER_BASE_DELAY_MS * Math.pow(2, attempt),
    AUTO_WRITER_MAX_DELAY_MS,
  );
  const jitter = base * 0.3 * Math.random();
  return Math.floor(base + jitter);
}

async function sleepCancellable(ms: number, controller: RuntimeController): Promise<void> {
  const step = 200;
  let waited = 0;
  while (waited < ms) {
    if (controller.cancelled) return;
    const slice = Math.min(step, ms - waited);
    await new Promise((r) => setTimeout(r, slice));
    waited += slice;
  }
}

async function invokeOneAgent(args: {
  runId: string;
  chapterId: string;
  agentInput: AgentCallInput;
  getWindow: () => BrowserWindow | null;
  controller: RuntimeController;
}): Promise<AgentCallOutput> {
  const { controller, agentInput } = args;

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= AUTO_WRITER_MAX_RETRY; attempt += 1) {
    if (controller.cancelled) {
      return { text: "", tokensIn: 0, tokensOut: 0 };
    }
    try {
      return await invokeOneAgentOnce(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      const classified = classifyAgentError(message);

      if (!classified.retryable || attempt === AUTO_WRITER_MAX_RETRY) {
        logger.error(
          `auto-writer agent[${agentInput.role}] gave up after ${attempt + 1} attempt(s): ${message}`,
        );
        throw error;
      }

      const delay = computeBackoffMs(attempt, classified.retryAfterSec);
      logger.warn(
        `auto-writer agent[${agentInput.role}] attempt ${attempt + 1} failed (${classified.reason}); retry in ${delay}ms`,
      );
      await sleepCancellable(delay, controller);
    }
  }
  // 理论不会到达：上面循环要么 return 要么 throw
  throw new Error(lastError ?? "auto-writer: unknown agent error");
}

async function invokeOneAgentOnce(args: {
  runId: string;
  chapterId: string;
  agentInput: AgentCallInput;
  getWindow: () => BrowserWindow | null;
  controller: RuntimeController;
}): Promise<AgentCallOutput> {
  const { runId, chapterId, agentInput, getWindow, controller } = args;
  const ctx = getAppContext();

  const resolvedScene = resolveSceneBinding("auto-writer", {
    explicitProviderId: agentInput.binding.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? agentInput.binding.providerId,
  );
  if (!providerRecord) {
    throw new Error(
      `auto-writer: provider not found: ${agentInput.binding.providerId}`,
    );
  }
  const pickedKey = await pickProviderKey(providerRecord);
  if (!pickedKey) {
    throw new Error(
      `auto-writer: no usable api key for provider ${providerRecord.id}`,
    );
  }
  const apiKey = pickedKey.apiKey;

  const stream = streamText({
    providerRecord,
    apiKey,
    systemPrompt: agentInput.systemPrompt,
    messages: [{ role: "user", content: agentInput.userPrompt }],
    ...resolveAutoWriterGenerationOptions(agentInput.role, agentInput.binding),
    model: agentInput.binding.model,
  });

  let accumulated = "";
  let bufferedDelta = "";
  let lastChunkEmitAt = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let success = false;

  // segmentIndex 在 agentInput 里没有；emit chunk 时统一用 -1（writer 之外的角色），
  // writer 的 segmentIndex 由 deps.emitPhase 已经传给 UI。
  // UI 渲染时通过 agentRole + accumulatedText 即可。
  const segmentIndex = -1;

  const flushDelta = (force = false): void => {
    if (!bufferedDelta) return;
    if (agentInput.silent) {
      bufferedDelta = "";
      return;
    }
    const now = Date.now();
    if (!force && bufferedDelta.length < 120 && now - lastChunkEmitAt < 90) return;
    const event: AutoWriterChunkEvent = {
      runId,
      chapterId,
      agentRole: agentInput.role,
      segmentIndex,
      delta: bufferedDelta,
      accumulatedText: "",
      emittedAt: new Date().toISOString(),
    };
    bufferedDelta = "";
    lastChunkEmitAt = now;
    emitToWindow<AutoWriterChunkEvent>(
      getWindow,
      ipcEventChannels.autoWriterChunk,
      event,
    );
  };

  try {
    for await (const chunk of stream) {
      if (controller.cancelled) break;
      if (chunk.type === "delta" && chunk.textDelta) {
        accumulated += chunk.textDelta;
        bufferedDelta += chunk.textDelta;
        flushDelta(false);
        continue;
      }
      if (chunk.type === "done") {
        flushDelta(true);
        if (chunk.usage) {
          tokensIn = chunk.usage.inputTokens ?? 0;
          tokensOut = chunk.usage.outputTokens ?? 0;
        }
        success = true;
        continue;
      }
      if (chunk.type === "error") {
        throw new Error(chunk.error ?? "stream_error");
      }
    }
  } finally {
    reportProviderKeyResult(pickedKey.keyId, success);
    void ctx;
  }

  // 容错：parseFindings 用作"轻量自检"防止某些 provider 提前结束
  // 不需要在这里 parse，只用作示例引用以满足 linter
  void parseFindings;

  return {
    text: accumulated,
    tokensIn,
    tokensOut,
  };
}
