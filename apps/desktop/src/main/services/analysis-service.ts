import { randomUUID } from "crypto";
import type { BrowserWindow } from "electron";
import {
  insertFeedback,
  listFeedbacksByChapter,
  type ProviderPersistenceRecord,
} from "@inkforge/storage";
import type {
  AIFeedbackRecord,
  LLMAnalyzeInput,
  LLMAnalyzeResponse,
  LLMChunkEvent,
  LLMDoneEvent,
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
import { RateLimiter } from "./rate-limiter";

const LLM_CHUNK_CHANNEL: typeof ipcEventChannels.llmChunk = "llm:chunk";
const LLM_DONE_CHANNEL: typeof ipcEventChannels.llmDone = "llm:done";

const RETRY_LIMIT = 2;
const analysisRateLimiter = new RateLimiter({ max: 2, windowMs: 60_000 });

function buildSystemPrompt(custom: string | undefined, alreadyNoted: string[]): string {
  if (custom && custom.trim()) return custom;
  const base = [
    "你是一位中文小说写作的静默陪写助手。",
    "仔细阅读用户提供的章节正文片段，用不超过 150 字给出最有价值的一条提醒或建议：",
    "- 优先指出可能的人物、时间线、设定不一致；",
    "- 若没有，则提一条可落地的改写/节奏建议；",
    "- 始终保持克制，绝不改写用户原文，不要长篇大论。",
  ];
  if (alreadyNoted.length > 0) {
    base.push("");
    base.push("【以下问题已指出过，避免重复】");
    alreadyNoted.forEach((note, idx) => base.push(`${idx + 1}. ${note}`));
    base.push("请给出不同角度的新建议。");
  }
  return base.join("\n");
}

function fetchRecentFeedbackSummaries(
  chapterId: string,
  limit: number,
): string[] {
  try {
    const ctx = getAppContext();
    const rows = listFeedbacksByChapter(ctx.db, chapterId, limit);
    const summaries: string[] = [];
    for (const row of rows) {
      if (row.dismissed) continue;
      const text = typeof row.payload?.text === "string" ? (row.payload.text as string) : "";
      if (!text) continue;
      const line = text.replace(/\s+/g, " ").trim().slice(0, 80);
      if (line) summaries.push(line);
      if (summaries.length >= limit) break;
    }
    return summaries;
  } catch {
    return [];
  }
}

export interface StartAnalysisOptions {
  input: LLMAnalyzeInput;
  window: BrowserWindow | null;
}

export async function startAnalysis(options: StartAnalysisOptions): Promise<LLMAnalyzeResponse> {
  const { input, window } = options;
  const analysisId = randomUUID();

  if (!analysisRateLimiter.check(input.chapterId)) {
    emitDone(window, {
      analysisId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      providerId: input.providerId ?? "",
      status: "failed",
      error: "rate_limited",
    });
    return { analysisId, status: "started" };
  }
  analysisRateLimiter.touch(input.chapterId);

  const resolvedScene = resolveSceneBinding("analyze", {
    explicitProviderId: input.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? input.providerId,
  );
  if (!providerRecord) {
    emitDone(window, {
      analysisId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      providerId: input.providerId ?? "",
      status: "failed",
      error: "provider_not_configured",
    });
    return { analysisId, status: "started" };
  }

  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) {
    emitDone(window, {
      analysisId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      providerId: providerRecord.id,
      status: "failed",
      error: "api_key_missing",
    });
    return { analysisId, status: "started" };
  }

  void runAnalysis({
    analysisId,
    input,
    providerRecord,
    apiKey,
    window,
  }).catch((error) => {
    logger.warn("analysis run failed unexpectedly", error);
  });

  return { analysisId, status: "started" };
}

interface RunAnalysisParams {
  analysisId: string;
  input: LLMAnalyzeInput;
  providerRecord: ProviderPersistenceRecord;
  apiKey: string;
  window: BrowserWindow | null;
}

async function runAnalysis(params: RunAnalysisParams): Promise<void> {
  const { analysisId, input, providerRecord, apiKey, window } = params;
  const ctx = getAppContext();
  const alreadyNoted = fetchRecentFeedbackSummaries(input.chapterId, 3);
  const systemPrompt = buildSystemPrompt(input.systemPrompt, alreadyNoted);
  const baseMessage = input.chapterText.trim();
  const ragBlock = buildRagBlock(input.projectId, baseMessage);
  const userMessage = ragBlock ? `${ragBlock}\n${baseMessage}` : baseMessage;

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
    try {
      let accumulatedText = "";
      const stream = streamText({
        providerRecord,
        apiKey,
        model: input.model ?? providerRecord.defaultModel,
        systemPrompt,
        temperature: input.temperature ?? 0.6,
        maxTokens: input.maxTokens ?? 400,
        userMessage,
      });
      for await (const chunk of stream) {
        if (chunk.type === "delta" && chunk.textDelta) {
          accumulatedText += chunk.textDelta;
          emitChunk(window, {
            analysisId,
            projectId: input.projectId,
            chapterId: input.chapterId,
            delta: chunk.textDelta,
            accumulatedText,
            providerId: providerRecord.id,
            emittedAt: new Date().toISOString(),
          });
        }
        if (chunk.type === "error" && chunk.error) {
          throw new Error(chunk.error);
        }
      }
      const finalText = accumulatedText.trim();
      const feedback: AIFeedbackRecord | undefined = finalText
        ? insertFeedback(ctx.db, {
            id: analysisId,
            projectId: input.projectId,
            chapterId: input.chapterId,
            type: "analysis",
            payload: {
              text: finalText,
              providerId: providerRecord.id,
              model: input.model ?? providerRecord.defaultModel,
            },
            trigger: input.trigger ?? "auto-200",
          })
        : undefined;
      emitDone(window, {
        analysisId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        providerId: providerRecord.id,
        status: "completed",
        feedback,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(`analysis attempt ${attempt + 1} failed`, lastError);
      if (attempt === RETRY_LIMIT) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  emitDone(window, {
    analysisId,
    projectId: input.projectId,
    chapterId: input.chapterId,
    providerId: providerRecord.id,
    status: "failed",
    error: lastError ?? "unknown_error",
  });
}

function emitChunk(window: BrowserWindow | null, payload: LLMChunkEvent): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(LLM_CHUNK_CHANNEL, payload);
}

function emitDone(window: BrowserWindow | null, payload: LLMDoneEvent): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(LLM_DONE_CHANNEL, payload);
}
