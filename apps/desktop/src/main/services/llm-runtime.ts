import { createProvider } from "@inkforge/llm-core";
import type {
  LLMChunk,
  LLMMessage,
  LLMProvider,
  LLMRequest,
} from "@inkforge/llm-core";
import {
  getFirstProviderPersistenceRecord,
  getProviderPersistenceRecord,
  listProviderKeyPersistenceRecords,
  markProviderKeyFailure,
  markProviderKeySuccess,
  type ProviderKeyPersistence,
  type ProviderPersistenceRecord,
} from "@inkforge/storage";
import type {
  ProviderHealthSnapshot,
  ProviderKeyHealth,
  ProviderKeyStrategy,
  SkillRunUsage,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

const MOCK_PROVIDER_ID = "inkforge-mock";
const MOCK_KEY_ID = "inkforge-mock-key";

function isMockLlmEnabled(): boolean {
  return process.env.INKFORGE_MOCK_LLM === "1";
}

function isMockProviderId(providerId?: string | null): boolean {
  return (
    providerId === MOCK_PROVIDER_ID ||
    providerId === "mock" ||
    providerId === "mock-llm"
  );
}

const MOCK_PROVIDER_RECORD: ProviderPersistenceRecord = {
  id: MOCK_PROVIDER_ID,
  label: "InkForge Mock LLM",
  vendor: "openai-compat",
  baseUrl: "mock://inkforge",
  defaultModel: "inkforge-mock",
  tags: ["test", "mock"],
  encrypted: null,
  storedInKeychain: false,
  keyStrategy: "single",
  cooldownMs: 0,
};

function isMockProviderRecord(record: ProviderPersistenceRecord): boolean {
  return record.id === MOCK_PROVIDER_ID || record.baseUrl === "mock://inkforge";
}

export function resolveProviderRecord(providerId?: string): ProviderPersistenceRecord | null {
  if (isMockLlmEnabled() && (!providerId || isMockProviderId(providerId))) {
    return MOCK_PROVIDER_RECORD;
  }
  const ctx = getAppContext();
  return providerId
    ? getProviderPersistenceRecord(ctx.db, providerId)
    : getFirstProviderPersistenceRecord(ctx.db);
}

// In-memory rotation + sticky state per provider
const rotationIndex = new Map<string, number>();
const stickyKey = new Map<string, string>();

function now(): number {
  return Date.now();
}

function isCoolingDown(
  key: ProviderKeyPersistence,
  cooldownMs: number,
): boolean {
  if (!key.lastFailedAt) return false;
  const lastFailedMs = new Date(key.lastFailedAt).getTime();
  if (Number.isNaN(lastFailedMs)) return false;
  return now() - lastFailedMs < cooldownMs;
}

function pickWeighted(
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  const totalWeight = keys.reduce((sum, k) => sum + Math.max(0, k.weight), 0);
  if (totalWeight <= 0) return keys[0] ?? null;
  let roll = Math.random() * totalWeight;
  for (const key of keys) {
    const w = Math.max(0, key.weight);
    if (roll < w) return key;
    roll -= w;
  }
  return keys[keys.length - 1] ?? null;
}

function pickRoundRobin(
  providerId: string,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  const prev = rotationIndex.get(providerId) ?? -1;
  const nextIdx = (prev + 1) % keys.length;
  rotationIndex.set(providerId, nextIdx);
  return keys[nextIdx];
}

function pickSticky(
  providerId: string,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  const current = stickyKey.get(providerId);
  if (current) {
    const found = keys.find((k) => k.id === current);
    if (found) return found;
  }
  const picked = keys[0];
  stickyKey.set(providerId, picked.id);
  return picked;
}

function selectByStrategy(
  providerId: string,
  strategy: ProviderKeyStrategy,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  switch (strategy) {
    case "weighted":
      return pickWeighted(keys);
    case "round-robin":
      return pickRoundRobin(providerId, keys);
    case "sticky":
      return pickSticky(providerId, keys);
    case "single":
    default:
      return keys[0];
  }
}

async function readPlainKey(
  record: ProviderPersistenceRecord,
  key: ProviderKeyPersistence,
): Promise<string | null> {
  const ctx = getAppContext();
  const primary = await ctx.keystore.getKey(key.id, key.encrypted);
  if (primary) return primary;
  // Legacy fallback: migrated "primary" key retains its keytar entry under the provider id.
  if (key.id === `${record.id}-primary` || key.id === record.id) {
    const legacy = await ctx.keystore.getKey(record.id, record.encrypted);
    if (legacy) return legacy;
  }
  return null;
}

export interface PickedKey {
  keyId: string;
  apiKey: string;
}

async function tryKeys(
  record: ProviderPersistenceRecord,
  keys: ProviderKeyPersistence[],
): Promise<PickedKey | null> {
  for (const key of keys) {
    const plain = await readPlainKey(record, key);
    if (plain) return { keyId: key.id, apiKey: plain };
  }
  return null;
}

export async function pickProviderKey(
  record: ProviderPersistenceRecord,
): Promise<PickedKey | null> {
  if (isMockLlmEnabled() && isMockProviderRecord(record)) {
    return { keyId: MOCK_KEY_ID, apiKey: "mock-key" };
  }
  const ctx = getAppContext();
  const allKeys = listProviderKeyPersistenceRecords(ctx.db, record.id);
  const enabled = allKeys.filter((k) => !k.disabled);
  if (enabled.length === 0) {
    // Legacy single-key fallback
    const legacy = await ctx.keystore.getKey(record.id, record.encrypted);
    return legacy ? { keyId: record.id, apiKey: legacy } : null;
  }
  const ready = enabled.filter((k) => !isCoolingDown(k, record.cooldownMs));
  const candidates = ready.length > 0 ? ready : enabled;
  const picked = selectByStrategy(record.id, record.keyStrategy, candidates);
  if (!picked) return null;
  const plain = await readPlainKey(record, picked);
  if (plain) return { keyId: picked.id, apiKey: plain };
  // Primary pick missing, fall back to any remaining key with a secret.
  const remaining = candidates.filter((k) => k.id !== picked.id);
  return tryKeys(record, remaining);
}

export async function resolveApiKey(
  record: ProviderPersistenceRecord,
): Promise<string | null> {
  const picked = await pickProviderKey(record);
  return picked?.apiKey ?? null;
}

export function reportProviderKeyResult(keyId: string, ok: boolean): void {
  if (keyId === MOCK_KEY_ID) return;
  const ctx = getAppContext();
  if (ok) markProviderKeySuccess(ctx.db, keyId);
  else markProviderKeyFailure(ctx.db, keyId);
}

export function getProviderHealth(providerId: string): ProviderHealthSnapshot {
  const ctx = getAppContext();
  const record = getProviderPersistenceRecord(ctx.db, providerId);
  const keys = listProviderKeyPersistenceRecords(ctx.db, providerId);
  const cooldownMs = record?.cooldownMs ?? 60000;
  return {
    providerId,
    strategy: record?.keyStrategy ?? "single",
    cooldownMs,
    keys: keys.map<ProviderKeyHealth>((key) => ({
      keyId: key.id,
      label: key.label,
      disabled: key.disabled,
      recentSuccesses: 0,
      recentFailures: key.failCount,
      cooldownUntil:
        key.lastFailedAt && isCoolingDown(key, cooldownMs)
          ? new Date(new Date(key.lastFailedAt).getTime() + cooldownMs).toISOString()
          : null,
    })),
  };
}

export function instantiateProvider(
  record: ProviderPersistenceRecord,
  apiKey: string,
): LLMProvider {
  if (isMockLlmEnabled() && isMockProviderRecord(record)) {
    return new MockLlmProvider(record, apiKey);
  }
  return createProvider({
    id: record.id,
    label: record.label,
    vendor: record.vendor,
    baseUrl: record.baseUrl,
    apiKey,
    defaultModel: record.defaultModel,
    tags: record.tags,
  });
}

class MockLlmProvider implements LLMProvider {
  id: string;
  label: string;
  vendor: "openai-compat" = "openai-compat";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags: string[];

  constructor(record: ProviderPersistenceRecord, apiKey: string) {
    this.id = record.id;
    this.label = record.label;
    this.baseUrl = record.baseUrl;
    this.apiKey = apiKey;
    this.defaultModel = record.defaultModel;
    this.tags = record.tags;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async *complete(req: LLMRequest): AsyncIterable<LLMChunk> {
    const text = buildMockCompletion(req);
    const chunks = text.match(/[\s\S]{1,48}/g) ?? [text];
    for (const textDelta of chunks) {
      yield {
        type: "delta",
        vendor: this.vendor,
        textDelta,
      };
    }
    const promptText = [
      req.systemPrompt ?? "",
      ...req.messages.map((message) => message.content),
    ].join("\n");
    yield {
      type: "done",
      vendor: this.vendor,
      raw: {
        usage: {
          prompt_tokens: this.estimateTokens(promptText),
          completion_tokens: this.estimateTokens(text),
        },
      },
    };
  }
}

function buildMockCompletion(req: LLMRequest): string {
  const systemPrompt = req.systemPrompt ?? "";
  const userPrompt = req.messages.map((message) => message.content).join("\n\n");

  if (systemPrompt.includes("提纲师")) {
    return buildMockPlannerOutput(userPrompt);
  }
  if (systemPrompt.includes("执笔者")) {
    return buildMockWriterOutput(userPrompt);
  }
  if (systemPrompt.includes("审稿人")) {
    return "[]";
  }
  if (systemPrompt.includes("反思者")) {
    return "保持雨声茶馆的规则和沈青禾的克制观察，下一段继续推进朱砂印与送信人的关系。";
  }
  if (systemPrompt.includes("小说审查助手")) {
    return buildMockReviewOutput(userPrompt);
  }
  return "这是 INKFORGE_MOCK_LLM 的确定性回复，用于验证本地模型调用链路。";
}

function buildMockPlannerOutput(userPrompt: string): string {
  const maxSegments = Math.max(1, Math.min(3, extractNumberAfter(userPrompt, "# 段数上限") ?? 2));
  const beats = [
    "沈青禾进入雨声茶馆，收到封口压着师门朱砂印的来信。",
    "阿迟透露自己见过送信人，陆闻舟提出记忆茶资，迫使沈青禾作出选择。",
    "茶馆灯火忽暗，信纸显出第二行字，指向师父失踪前最后停留的地方。",
  ].slice(0, maxSegments);
  return JSON.stringify(
    beats.map((beat, index) => ({
      index: index + 1,
      beat,
    })),
  );
}

function buildMockWriterOutput(userPrompt: string): string {
  const segment = extractNumberAfter(userPrompt, "# 本段 Beat") ?? 1;
  if (segment <= 1) {
    return [
      "沈青禾推开雨声茶馆的木门时，檐下的水线像被谁用刀裁齐。灯火贴着桌沿浮动，掌柜陆闻舟把一封潮湿的信推到她面前，信封没有署名，封口却压着青松门独有的朱砂印。",
      "她没有立刻拆信，只用指腹轻轻按住那一点红。三年前师父失踪前，也带走过同样的印泥。角落里的阿迟抱剑不语，视线却先一步落在信纸上，像是等这一刻已经等了很久。",
    ].join("\n\n");
  }
  return [
    "阿迟终于开口，说送信人来时没有影子，只在门槛边留下半枚被雨泡软的铜钱。陆闻舟替沈青禾续了一盏茶，语气平静得近乎冷淡：雨声茶馆从不白收消息，想知道下一句，就要交出一段真实记忆。",
    "沈青禾望着茶盏里晃开的灯影，想起师父离山那夜也是这样的雨。她把信拆开，纸上只有一行字：天亮前找到送信人，否则朱砂印会替故人说完最后一句谎。",
  ].join("\n\n");
}

function buildMockReviewOutput(userPrompt: string): string {
  if (userPrompt.includes("朱砂印")) {
    return JSON.stringify([
      {
        severity: "info",
        excerpt: "封口却压着青松门独有的朱砂印",
        suggestion: "这枚朱砂印已经形成有效悬念，后续章节需要安排来源或伪造可能性。",
      },
    ]);
  }
  return "[]";
}

function extractNumberAfter(text: string, marker: string): number | null {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const slice = text.slice(start + marker.length, start + marker.length + 80);
  const match = slice.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface StreamTextInput {
  providerRecord: ProviderPersistenceRecord;
  apiKey: string;
  systemPrompt?: string;
  userMessage?: string;
  messages?: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface StreamTextChunk {
  type: "delta" | "done" | "error";
  textDelta?: string;
  error?: string;
  usage?: SkillRunUsage;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractUsage(raw: unknown): SkillRunUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as {
    usage?: Record<string, unknown>;
    message?: { usage?: Record<string, unknown> };
    usageMetadata?: Record<string, unknown>;
  };
  const usage = data.usage ?? data.message?.usage ?? data.usageMetadata;
  if (!usage) return undefined;
  const inputTokens =
    toNumber(usage.input_tokens) ??
    toNumber(usage.inputTokens) ??
    toNumber(usage.prompt_tokens) ??
    toNumber(usage.promptTokenCount);
  const outputTokens =
    toNumber(usage.output_tokens) ??
    toNumber(usage.outputTokens) ??
    toNumber(usage.completion_tokens) ??
    toNumber(usage.candidatesTokenCount);
  const totalTokens =
    toNumber(usage.total_tokens) ??
    toNumber(usage.totalTokens) ??
    toNumber(usage.totalTokenCount);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return undefined;
  const inTokens = inputTokens ?? 0;
  const outTokens = outputTokens ?? 0;
  return {
    inputTokens: inTokens,
    outputTokens: outTokens,
    totalTokens: totalTokens ?? inTokens + outTokens,
  };
}

function normalizeMessages(input: StreamTextInput): LLMMessage[] {
  if (input.messages && input.messages.length > 0) {
    return input.messages;
  }
  return [{ role: "user", content: input.userMessage ?? "" }];
}

export async function* streamText(
  input: StreamTextInput,
): AsyncIterable<StreamTextChunk> {
  const provider = instantiateProvider(input.providerRecord, input.apiKey);
  const messages = normalizeMessages(input);
  const stream = provider.complete({
    model: input.model ?? input.providerRecord.defaultModel,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    messages,
  });

  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) {
      yield {
        type: "delta",
        textDelta: chunk.textDelta,
      };
      continue;
    }
    if (chunk.type === "error") {
      yield {
        type: "error",
        error: chunk.error ?? "unknown_error",
      };
      continue;
    }
    if (chunk.type === "done") {
      yield {
        type: "done",
        usage: extractUsage(chunk.raw),
      };
    }
  }
}
