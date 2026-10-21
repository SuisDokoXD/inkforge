import { randomUUID } from "crypto";
import type { BrowserWindow } from "electron";
import {
  BUILTIN_DIMENSION_SPECS,
  computeReportSummary,
  findExcerptRange,
  getBuiltinPromptSpec,
  parseFindingsFromLlm,
  type BuiltinPromptContext,
} from "@inkforge/review-engine";
import {
  deleteReviewDimension,
  deleteReviewReport,
  getReviewDimensionById,
  getReviewFindingById,
  getReviewReportById,
  insertReviewFinding,
  insertReviewReport,
  listChapters,
  listNovelCharacters,
  listReviewDimensions,
  listReviewFindingsForReport,
  listReviewReports,
  listWorldEntries,
  readChapterFile,
  setReviewDimensionOrders,
  setReviewFindingDismissed,
  updateReviewReport,
  upsertReviewDimension,
  writeChapterFile,
} from "@inkforge/storage";
import type {
  ChapterRecord,
  ReviewApplyFixInput,
  ReviewApplyFixResponse,
  ReviewCancelInput,
  ReviewCancelResponse,
  ReviewDimDeleteInput,
  ReviewDimListInput,
  ReviewDimReorderInput,
  ReviewDimUpsertInput,
  ReviewDimensionRecord,
  ReviewDismissFindingInput,
  ReviewDismissFindingResponse,
  ReviewDoneEvent,
  ReviewExportInput,
  ReviewExportResponse,
  ReviewFindingRecord,
  ReviewGetInput,
  ReviewGetResponse,
  ReviewListInput,
  ReviewProgressEvent,
  ReviewReportRecord,
  ReviewReportSummary,
  ReviewRunInput,
  ReviewRunResponse,
  ipcEventChannels,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { buildRagBlock } from "./rag-service";

const PROGRESS_CHANNEL: typeof ipcEventChannels.reviewProgress = "review:progress";
const DONE_CHANNEL: typeof ipcEventChannels.reviewDone = "review:done";

const PROGRESS_THROTTLE_MS = 500;
const MAX_CHAPTER_CHARS = 18000;

interface ActiveReview {
  reportId: string;
  cancelled: boolean;
  lastProgressEmit: number;
}

const activeReviews = new Map<string, ActiveReview>();

function emit<T>(window: BrowserWindow | null, channel: string, payload: T): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

export function listReviewDimensionsEnsuringBuiltins(
  input: ReviewDimListInput,
): ReviewDimensionRecord[] {
  const ctx = getAppContext();
  const existing = listReviewDimensions(ctx.db, input.projectId);
  const existingBuiltinIds = new Set(
    existing.filter((d) => d.kind === "builtin" && d.projectId === input.projectId)
      .map((d) => d.builtinId ?? ""),
  );
  let insertedAny = false;
  for (let i = 0; i < BUILTIN_DIMENSION_SPECS.length; i += 1) {
    const spec = BUILTIN_DIMENSION_SPECS[i];
    if (existingBuiltinIds.has(spec.id)) continue;
    upsertReviewDimension(ctx.db, {
      id: `${input.projectId}:builtin:${spec.id}`,
      projectId: input.projectId,
      name: spec.displayName,
      kind: "builtin",
      builtinId: spec.id,
      scope: "book",
      severity: spec.defaultSeverity,
      enabled: true,
      order: i,
    });
    insertedAny = true;
  }
  return insertedAny ? listReviewDimensions(ctx.db, input.projectId) : existing;
}

export function upsertReviewDimensionRecord(
  input: ReviewDimUpsertInput,
): ReviewDimensionRecord {
  const ctx = getAppContext();
  const id = input.id ?? `dim:${randomUUID()}`;
  return upsertReviewDimension(ctx.db, {
    id,
    projectId: input.projectId,
    name: input.name,
    kind: input.kind,
    builtinId: input.builtinId ?? null,
    skillId: input.skillId ?? null,
    scope: input.scope,
    severity: input.severity,
    enabled: input.enabled,
    order: input.order,
  });
}

export function deleteReviewDimensionRecord(
  input: ReviewDimDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  deleteReviewDimension(ctx.db, input.id);
  return { id: input.id };
}

export function reorderReviewDimensionRecords(
  input: ReviewDimReorderInput,
): ReviewDimensionRecord[] {
  const ctx = getAppContext();
  return setReviewDimensionOrders(ctx.db, input.projectId, input.orderedIds);
}

export function listReviewReportsForProject(
  input: ReviewListInput,
): ReviewReportRecord[] {
  const ctx = getAppContext();
  return listReviewReports(ctx.db, {
    projectId: input.projectId,
    limit: input.limit,
  });
}

export function getReviewReportWithFindings(
  input: ReviewGetInput,
): ReviewGetResponse | null {
  const ctx = getAppContext();
  const report = getReviewReportById(ctx.db, input.reportId);
  if (!report) return null;
  const findings = listReviewFindingsForReport(ctx.db, input.reportId);
  return { report, findings };
}

export function dismissReviewFinding(
  input: ReviewDismissFindingInput,
): ReviewDismissFindingResponse {
  const ctx = getAppContext();
  const updated = setReviewFindingDismissed(
    ctx.db,
    input.findingId,
    input.dismissed ?? true,
  );
  if (!updated) throw new Error(`finding not found: ${input.findingId}`);
  return { findingId: updated.id, dismissed: updated.dismissed };
}

export function cancelReview(input: ReviewCancelInput): ReviewCancelResponse {
  const state = activeReviews.get(input.reportId);
  if (state) state.cancelled = true;
  return { reportId: input.reportId, cancelled: true };
}

function resolveRangeChapters(
  input: ReviewRunInput,
  allChapters: ChapterRecord[],
): ChapterRecord[] {
  if (input.rangeKind === "book") return allChapters;
  const ids = new Set((input.rangeIds ?? []).filter(Boolean));
  if (ids.size === 0) return allChapters;
  return allChapters.filter((c) => ids.has(c.id));
}

function buildPromptContext(projectId: string): BuiltinPromptContext {
  const ctx = getAppContext();
  const characters = listNovelCharacters(ctx.db, projectId).slice(0, 12).map((c) => ({
    name: c.name,
    persona: c.persona ?? undefined,
    traits: Object.keys(c.traits ?? {}).slice(0, 8),
    backstory: c.backstory,
  }));
  const worldEntries = listWorldEntries(ctx.db, { projectId }).slice(0, 20).map(
    (entry) => ({
      title: entry.title,
      aliases: entry.aliases,
      content: entry.content,
    }),
  );
  return { characters, worldEntries };
}

export async function startReview(
  input: ReviewRunInput,
  window: BrowserWindow | null,
): Promise<ReviewRunResponse> {
  const ctx = getAppContext();
  const dimensions = listReviewDimensions(ctx.db, input.projectId).filter(
    (d) => d.enabled && (input.dimensionIds ? input.dimensionIds.includes(d.id) : true),
  );
  if (dimensions.length === 0) {
    throw new Error("no_enabled_dimensions");
  }
  const allChapters = listChapters(ctx.db, input.projectId);
  const chapters = resolveRangeChapters(input, allChapters);
  if (chapters.length === 0) {
    throw new Error("no_chapters_in_range");
  }
  const report = insertReviewReport(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    rangeKind: input.rangeKind,
    rangeIds: input.rangeIds ?? [],
  });

  activeReviews.set(report.id, {
    reportId: report.id,
    cancelled: false,
    lastProgressEmit: 0,
  });

  void runReview({
    report,
    dimensions,
    chapters,
    input,
    window,
  }).catch((error) => {
    logger.warn("review run failed unexpectedly", error);
    activeReviews.delete(report.id);
  });

  return { reportId: report.id, status: "started" };
}

interface RunReviewParams {
  report: ReviewReportRecord;
  dimensions: ReviewDimensionRecord[];
  chapters: ChapterRecord[];
  input: ReviewRunInput;
  window: BrowserWindow | null;
}

async function runReview(params: RunReviewParams): Promise<void> {
  const { report, dimensions, chapters, input, window } = params;
  const ctx = getAppContext();
  const resolvedScene = resolveSceneBinding("review", {
    explicitProviderId: input.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? input.providerId,
  );
  if (!providerRecord) {
    finalize(report.id, "failed", "provider_not_configured", window);
    return;
  }
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) {
    finalize(report.id, "failed", "api_key_missing", window);
    return;
  }
  const promptContext = buildPromptContext(input.projectId);
  const project = ctx.config; // unused for now; kept to satisfy lint-free access

  const totalChapters = chapters.length;
  const builtinDims = dimensions.filter((d) => d.kind === "builtin" && d.builtinId);
  const skillDims = dimensions.filter((d) => d.kind === "skill"); // currently not executed beyond noting
  if (skillDims.length > 0) {
    logger.warn(
      `review skill dimensions detected (${skillDims.length}); skipping — not implemented in M4-B`,
    );
  }

  const emittedFindings: ReviewFindingRecord[] = [];
  let cumulativeFindings = 0;

  try {
    for (let chapterIdx = 0; chapterIdx < totalChapters; chapterIdx += 1) {
      const chapter = chapters[chapterIdx];
      const state = activeReviews.get(report.id);
      if (!state || state.cancelled) break;

      const chapterText = safelyReadChapter(chapter);
      const trimmedText = chapterText.slice(0, MAX_CHAPTER_CHARS);

      for (const dim of builtinDims) {
        if (!dim.builtinId) continue;
        const spec = getBuiltinPromptSpec(dim.builtinId);
        if (!spec) continue;
        const baseUserMessage = spec.userPrompt({
          chapterTitle: chapter.title,
          chapterText: trimmedText,
        });
        const ragBlock = buildRagBlock(input.projectId, trimmedText);
        const userMessage = ragBlock ? `${ragBlock}\n${baseUserMessage}` : baseUserMessage;
        const drafts = await runDimensionForChapter({
          providerRecord,
          apiKey,
          model: input.model,
          systemPrompt: spec.systemPrompt(promptContext),
          userMessage,
        });

        for (const draft of drafts) {
          const range = findExcerptRange(chapterText, draft.excerpt);
          const record = insertReviewFinding(ctx.db, {
            id: randomUUID(),
            reportId: report.id,
            dimensionId: dim.id,
            chapterId: chapter.id,
            excerpt: draft.excerpt,
            excerptStart: range?.start ?? null,
            excerptEnd: range?.end ?? null,
            severity: draft.severity ?? dim.severity,
            suggestion: draft.suggestion,
          });
          emittedFindings.push(record);
        }
        cumulativeFindings += drafts.length;
      }

      emitProgressThrottled(window, {
        reportId: report.id,
        phase: "map",
        processedChapters: chapterIdx + 1,
        totalChapters,
        partialFindings: cumulativeFindings,
        emittedAt: new Date().toISOString(),
      });
    }
    const finalState = activeReviews.get(report.id);
    if (!finalState) return;
    if (finalState.cancelled) {
      finalize(report.id, "cancelled", "user_cancelled", window);
      return;
    }
    const summary = computeReportSummary(emittedFindings);
    updateReviewReport(ctx.db, {
      id: report.id,
      status: "completed",
      summary,
      finishedAt: new Date().toISOString(),
    });
    activeReviews.delete(report.id);
    emit(window, DONE_CHANNEL, {
      reportId: report.id,
      status: "completed",
      summary,
      finishedAt: new Date().toISOString(),
    } satisfies ReviewDoneEvent);
  } catch (error) {
    finalize(
      report.id,
      "failed",
      error instanceof Error ? error.message : String(error),
      window,
    );
  }
  // Suppress unused lint warning for project context ref above.
  void project;
}

function safelyReadChapter(chapter: ChapterRecord): string {
  const ctx = getAppContext();
  try {
    const project = ctx.db
      .prepare(`SELECT path FROM projects WHERE id = ?`)
      .get(chapter.projectId) as { path: string } | undefined;
    if (!project?.path) return "";
    return readChapterFile(project.path, chapter.filePath);
  } catch (error) {
    logger.warn(`review failed to read chapter ${chapter.id}`, error);
    return "";
  }
}

interface RunDimensionParams {
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
}

async function runDimensionForChapter(
  params: RunDimensionParams,
): Promise<ReturnType<typeof parseFindingsFromLlm>> {
  const { providerRecord, apiKey, model, systemPrompt, userMessage } = params;
  let accumulated = "";
  const stream = streamText({
    providerRecord,
    apiKey,
    model: model ?? providerRecord.defaultModel,
    systemPrompt,
    userMessage,
    temperature: 0.3,
    maxTokens: 1200,
  });
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) {
      accumulated += chunk.textDelta;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error ?? "review_dimension_stream_error");
    }
  }
  return parseFindingsFromLlm(accumulated, "warn");
}

function emitProgressThrottled(
  window: BrowserWindow | null,
  event: ReviewProgressEvent,
): void {
  const state = activeReviews.get(event.reportId);
  if (!state) return;
  const now = Date.now();
  if (now - state.lastProgressEmit < PROGRESS_THROTTLE_MS) return;
  state.lastProgressEmit = now;
  emit(window, PROGRESS_CHANNEL, event);
}

function finalize(
  reportId: string,
  status: "failed" | "cancelled",
  error: string,
  window: BrowserWindow | null,
): void {
  const ctx = getAppContext();
  try {
    updateReviewReport(ctx.db, {
      id: reportId,
      status,
      error,
      finishedAt: new Date().toISOString(),
    });
  } catch {
    // ignore persistence failure during finalize
  }
  activeReviews.delete(reportId);
  emit(window, DONE_CHANNEL, {
    reportId,
    status,
    error,
    finishedAt: new Date().toISOString(),
  } satisfies ReviewDoneEvent);
}

function severityMarker(severity: string): string {
  if (severity === "error") return "❗";
  if (severity === "warn") return "⚠️";
  return "ℹ️";
}

export function exportReviewReport(input: ReviewExportInput): ReviewExportResponse {
  const ctx = getAppContext();
  const report = getReviewReportById(ctx.db, input.reportId);
  if (!report) throw new Error(`report not found: ${input.reportId}`);
  const findings = listReviewFindingsForReport(ctx.db, input.reportId);
  const chapterTitleById = new Map<string, string>();
  for (const chapter of listChapters(ctx.db, report.projectId)) {
    chapterTitleById.set(chapter.id, chapter.title);
  }
  const lines: string[] = [];
  lines.push(`# 全文审查报告`);
  lines.push("");
  lines.push(
    `- 项目 ID：\`${report.projectId}\``,
  );
  lines.push(`- 开始：${report.startedAt}`);
  if (report.finishedAt) lines.push(`- 完成：${report.finishedAt}`);
  lines.push(`- 状态：${report.status}`);
  lines.push(`- 范围：${report.rangeKind}${report.rangeIds.length > 0 ? ` (${report.rangeIds.length} 章)` : ""}`);
  lines.push("");
  lines.push(`## 统计`);
  const s = report.summary as ReviewReportSummary;
  lines.push(`- ❗ 错误 ${s.totals.error} · ⚠️ 警告 ${s.totals.warn} · ℹ️ 信息 ${s.totals.info}`);
  lines.push("");
  lines.push(`## Findings`);
  for (const finding of findings) {
    const dim = getReviewDimensionById(ctx.db, finding.dimensionId);
    const chapterTitle = finding.chapterId
      ? chapterTitleById.get(finding.chapterId) ?? finding.chapterId
      : "（无章节）";
    lines.push("");
    lines.push(
      `### ${severityMarker(finding.severity)} ${dim?.name ?? finding.dimensionId} · ${chapterTitle}`,
    );
    if (finding.excerpt) {
      lines.push(`> ${finding.excerpt}`);
    }
    if (finding.suggestion) {
      lines.push("");
      lines.push(finding.suggestion);
    }
    if (finding.dismissed) lines.push("");
    if (finding.dismissed) lines.push("_（已忽略）_");
  }
  const content = lines.join("\n");
  const fileName = `review-${report.id}.md`;
  return { fileName, content, format: "md" };
}

// =============================================================================
// Audit → Fix（两步审查的"修复"阶段）
// =============================================================================
// Audit 阶段在 startReview/runReview 里完成：识别问题、给出建议。
// Fix 阶段在这里：根据已有 finding，让 LLM 改写选段并按 mode 决定是否落盘。
//
// 设计要点：
//   - 永远先输出 patchedExcerpt 让 UI 做 diff 预览；mode="apply" 才真正写回
//   - 找不到 excerpt range 时也允许 preview，但 apply 会报错（避免误改无关位置）
//   - 调用方传 mode 字符串，方便一个 API 同时撑起"试试看"和"我确定要改"两步
// =============================================================================
export async function applyReviewFix(
  input: ReviewApplyFixInput,
): Promise<ReviewApplyFixResponse> {
  const ctx = getAppContext();
  const finding = getReviewFindingById(ctx.db, input.findingId);
  if (!finding) {
    throw new Error(`finding not found: ${input.findingId}`);
  }
  if (!finding.chapterId) {
    throw new Error("finding has no chapter; cannot apply fix");
  }
  if (!finding.suggestion?.trim()) {
    throw new Error("finding has no suggestion text; nothing to apply");
  }

  // 找到 chapter 文件位置（review_findings 里没存 projectId，先回到 report）
  const report = getReviewReportById(ctx.db, finding.reportId);
  if (!report) throw new Error("parent report missing");
  const projectRow = ctx.db
    .prepare(`SELECT path FROM projects WHERE id = ?`)
    .get(report.projectId) as { path: string } | undefined;
  if (!projectRow?.path) throw new Error("project path missing");

  const chapter = listChapters(ctx.db, report.projectId).find(
    (c) => c.id === finding.chapterId,
  );
  if (!chapter) throw new Error("chapter not found in project");

  const fullText = readChapterFile(projectRow.path, chapter.filePath);
  // 先决定 originalExcerpt：优先用 range，其次回退到 finding.excerpt
  const hasRange =
    finding.excerptStart != null &&
    finding.excerptEnd != null &&
    finding.excerptEnd > finding.excerptStart &&
    finding.excerptEnd <= fullText.length;
  const originalExcerpt = hasRange
    ? fullText.slice(finding.excerptStart!, finding.excerptEnd!)
    : finding.excerpt;

  // 解析 provider（与 audit 阶段同一 scene_key=review）
  const resolvedScene = resolveSceneBinding("review", {
    explicitProviderId: input.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? input.providerId,
  );
  if (!providerRecord) throw new Error("provider_not_configured");
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) throw new Error("api_key_missing");

  // 跑 LLM：让它"基于建议改写选段"，并且不要带额外解释
  const systemPrompt =
    "你是小说修订助手。基于编辑给出的修订建议改写读者标出的选段。" +
    "严格遵守：1) 只输出修订后的新片段本身，不要附加任何解释、不要加引号、" +
    "不要加 markdown 标题；2) 保持长度与原段相近（±30%），除非建议明确要求扩写/缩写；" +
    "3) 不改动角色名、地点名、设定专名。";
  const userMessage = [
    `【原文片段】`,
    originalExcerpt,
    "",
    `【修订建议】`,
    finding.suggestion,
    "",
    `请输出修订后的新片段：`,
  ].join("\n");

  const stream = streamText({
    providerRecord,
    apiKey,
    model: input.model ?? resolvedScene.model ?? providerRecord.defaultModel,
    systemPrompt,
    userMessage,
    temperature: 0.4,
    maxTokens: 1500,
  });

  let patched = "";
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) patched += chunk.textDelta;
    if (chunk.type === "error") {
      throw new Error(chunk.error ?? "review_fix_stream_error");
    }
  }
  patched = patched.trim();
  if (!patched) throw new Error("empty_patched_excerpt");

  // preview 模式：不落盘，仅返回结果
  if (input.mode === "preview") {
    return {
      findingId: finding.id,
      originalExcerpt,
      patchedExcerpt: patched,
      applied: false,
      range: hasRange
        ? { start: finding.excerptStart!, end: finding.excerptEnd! }
        : null,
    };
  }

  // apply 模式：必须有可靠 range，否则拒绝（避免误伤）
  if (!hasRange) {
    throw new Error(
      "cannot apply: finding has no precise range; use preview and manual edit",
    );
  }
  const newFullText =
    fullText.slice(0, finding.excerptStart!) +
    patched +
    fullText.slice(finding.excerptEnd!);
  writeChapterFile(projectRow.path, chapter.filePath, newFullText);
  return {
    findingId: finding.id,
    originalExcerpt,
    patchedExcerpt: patched,
    applied: true,
    range: { start: finding.excerptStart!, end: finding.excerptEnd! },
  };
}
