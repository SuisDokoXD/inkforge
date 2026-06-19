// =============================================================================
// 卡牌融合服务（薄编排版）
// =============================================================================
// 重构后只负责编排：源卡读取 → provider 解析 → LLM 调用 → 输出解析 → 可选落库。
// 业务细节拆到：
//   - fusion/build-fusion-prompt.ts —— prompt 构建（纯函数）
//   - fusion/parse-fusion-output.ts —— LLM 输出 JSON 容错抽取（纯函数）
// =============================================================================

import { randomUUID } from "crypto";
import {
  getWorldPackById,
  insertWorldPack,
  insertWorldPackEntry,
  listWorldPackEntries,
} from "@inkforge/storage";
import type {
  WorldPackFuseInput,
  WorldPackFuseResponse,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import {
  FUSION_SYSTEM_PROMPT,
  buildFusionPrompt,
  type FusionSource,
} from "./fusion/build-fusion-prompt";
import { parseFusionOutput, type FusionSuggestion } from "./fusion/parse-fusion-output";

export async function fuseWorldPacks(
  input: WorldPackFuseInput,
): Promise<WorldPackFuseResponse> {
  const ctx = getAppContext();

  // ---- 1. 输入校验 ----
  if (!Array.isArray(input.sourcePackIds) || input.sourcePackIds.length < 2) {
    throw new Error("fusion requires at least 2 source packs");
  }

  // ---- 2. 读源卡（主表 + entries） ----
  const sources: FusionSource[] = [];
  const missing: string[] = [];
  for (const id of input.sourcePackIds) {
    const pack = getWorldPackById(ctx.db, id);
    if (!pack) {
      missing.push(id);
      continue;
    }
    sources.push({ pack, entries: listWorldPackEntries(ctx.db, id) });
  }
  if (missing.length > 0) {
    throw new Error(`source pack(s) not found: ${missing.join(", ")}`);
  }

  const suggestion =
    input.persist && input.suggestion
      ? input.suggestion
      : await generateFusionSuggestion(input, sources);

  // ---- 3. 可选落库 ----
  const packRecord = input.persist
    ? persistFusionSuggestion(suggestion, input.sourcePackIds)
    : undefined;

  return { suggestion, pack: packRecord };
}

async function generateFusionSuggestion(
  input: WorldPackFuseInput,
  sources: FusionSource[],
): Promise<FusionSuggestion> {
  // ---- 3. 解 provider/model（走 'skill' scene binding） ----
  const resolved = resolveSceneBinding("skill", {
    explicitProviderId: input.providerId,
    explicitModel: input.model ?? null,
  });
  const providerRecord = resolveProviderRecord(
    resolved.providerId ?? input.providerId,
  );
  if (!providerRecord) throw new Error("provider not configured for fusion");
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) throw new Error("api key missing for provider");
  const model = input.model ?? resolved.model ?? providerRecord.defaultModel;

  // ---- 4. 调 LLM（流式累积，等结束） ----
  const userMessage = buildFusionPrompt(sources, input.brief ?? "");
  const stream = streamText({
    providerRecord,
    apiKey,
    model,
    systemPrompt: FUSION_SYSTEM_PROMPT,
    userMessage,
    temperature: 0.55,
    maxTokens: 4000,
  });
  let accumulated = "";
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) accumulated += chunk.textDelta;
    if (chunk.type === "error" && chunk.error) {
      throw new Error(`fusion LLM error: ${chunk.error}`);
    }
  }

  // ---- 5. 解析输出 ----
  return parseFusionOutput(accumulated);
}

function persistFusionSuggestion(
  suggestion: FusionSuggestion,
  sourcePackIds: string[],
): WorldPackFuseResponse["pack"] {
  const ctx = getAppContext();
  let packRecord: WorldPackFuseResponse["pack"];
  const tx = ctx.db.transaction(() => {
    const packId = randomUUID();
    packRecord = insertWorldPack(ctx.db, {
      id: packId,
      name: suggestion.name,
      tagline: suggestion.tagline,
      description: suggestion.description,
      tags: suggestion.tags,
      origin: "fused",
      parentPackIds: sourcePackIds,
    });
    suggestion.entries.forEach((e, idx) => {
      insertWorldPackEntry(ctx.db, {
        id: randomUUID(),
        packId,
        category: e.category,
        title: e.title,
        content: e.content,
        aliases: e.aliases,
        keys: e.keys,
        order: idx,
      });
    });
  });
  tx();
  return packRecord;
}
