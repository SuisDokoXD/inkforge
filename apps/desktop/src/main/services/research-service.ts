import { randomUUID } from "crypto";
import {
  createBingAdapter,
  createLlmFallbackAdapter,
  createSerpapiAdapter,
  createTavilyAdapter,
  type ResearchProviderAdapter,
} from "@inkforge/research-core";
import {
  deleteResearchCredential as deleteResearchCredentialFromDB,
  deleteResearchNote,
  getResearchCredentialEncrypted,
  getResearchNoteById,
  insertResearchNote,
  listResearchNotes,
  updateResearchNote,
  upsertResearchCredential as upsertResearchCredentialToDB,
} from "@inkforge/storage";
import type {
  ResearchCredentialDeleteInput,
  ResearchCredentialStatus,
  ResearchCredentialStatusInput,
  ResearchCredentialUpsertInput,
  ResearchDeleteInput,
  ResearchGetInput,
  ResearchListInput,
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSaveInput,
  ResearchSearchHit,
  ResearchSearchInput,
  ResearchSearchResponse,
  ResearchUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";

const CREDENTIAL_PROVIDERS: ResearchProvider[] = ["tavily", "bing", "serpapi"];
const MAX_EXPANDED_QUERIES = 8;

/**
 * Clean up noisy search result snippets: strip HTML tags, wiki/markdown syntax,
 * decode entities, remove coordinate noise, collapse whitespace.
 */
function cleanSnippet(text: string): string {
  if (!text) return "";
  let cleaned = text
    // Decode common HTML entities first (before stripping tags)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#[xX]?[0-9a-fA-F]+;/g, "")
    .replace(/&[a-z]+;/gi, "")
    // Strip HTML tags
    .replace(/<[^>]*>/g, " ")
    // Strip JSON blobs (often leaked from rich search results)
    .replace(/\{[^{}]*"(?:html|text|title|snippet)"[^}]*\}/g, " ")
    // Strip wiki heading markers (= Heading =, == Heading ==)
    .replace(/^=+\s*|\s*=+$/gm, " ")
    // Strip markdown ATX headings (# ## ###)
    .replace(/^#{1,6}\s*/gm, " ")
    // Strip wiki list markers
    .replace(/^[\*#;:]+/gm, " ")
    // Strip wiki template invocations {{...}}
    .replace(/\{\{[^}]*\}\}/g, " ")
    // Strip wiki links [[target]] and [[target|text]]
    .replace(/\[\[[^\]]*\]\]/g, " ")
    // Strip wiki reference/citation markers [1] [note 1] [a]
    .replace(/\[\s*[a-z]*\s*\d*\s*\]/gi, " ")
    // Strip URL query noise from wiki
    .replace(/[&?](?:action|redlink|oldid|diff|printable|veaction|section|params)=[^&\s]*/gi, " ")
    // Strip geo coordinate patterns (Chinese + Western formats)
    .replace(/座標[：:]\s*\d{1,3}°\d{1,2}[′']\d{1,2}(\.\d+)?[″"][NSEW]/g, " ")
    .replace(/\d{1,3}°\d{1,2}[′']\d{1,2}(\.\d+)?[″"]?\s*[NSEW]/g, " ")
    .replace(/geohack\.toolforge\.org[^\s]*/gi, " ")
    // Strip raw URLs
    .replace(/https?:\/\/\S+/g, " ")
    // Strip parenthesized geo coords (23.6546083°N 113.8144750°E)
    .replace(/\(?\s*\d{1,3}(\.\d+)?\s*[°\s]\s*\d{1,3}(\.\d+)?\s*[°\s]*[NSEW][^)]*\)?/g, " ")
    // Strip wiki "(页面不存在)" noise
    .replace(/[（(]页面不存在[）)]/g, "")
    // Strip leftover quoted attribute values from stripped HTML
    .replace(/"\s*[^"]{2,40}\s*"\s*\)/g, " ")
    .replace(/\"[^"]*\"/g, " ")  // Remove quoted strings (wiki alt text leftovers)
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*\.\s*/g, ". ")  // Fix double periods
    .replace(/\(\s*\)/g, "")  // Remove empty parens
    .replace(/\[\s*\]/g, "")  // Remove empty brackets
    .trim();

  // Second pass: remove leftover fragments that only make sense in wiki context
  cleaned = cleaned
    .replace(/^\s*[·•●]\s*/gm, "")  // Bullet points
    .replace(/^\s*\d+\.\s*/gm, "")  // Numbered list markers
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

function pushUnique(target: string[], value: string): void {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return;
  if (!target.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(text);
}

function buildResearchQueries(rawQuery: string): string[] {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  const queries: string[] = [];
  pushUnique(queries, query);

  const mentionsJapan =
    /日本|日文|东京|東京|京都|大阪|北海道|富士|神社|和风|和風|japan|japanese|nihon|nippon/i.test(
      query,
    );
  const mentionsMountain =
    /山|峰|岳|火山|登山|山脉|山地|mountain|volcano|hiking|climb/i.test(query);
  const mentionsPlace =
    mentionsMountain ||
    /地名|地点|地方|城市|村|町|县|県|岛|島|河|湖|寺|神社|城|地理|路线|路線|风土|風土|place|location|geography/i.test(
      query,
    );

  if (mentionsJapan && mentionsMountain) {
    pushUnique(queries, "日本 名山 维基百科");
    pushUnique(queries, "日本 山 一覧");
    pushUnique(queries, `${query} 日本 地理 历史`);
    pushUnique(queries, `${query} 観光 登山 歴史 アクセス`);
    pushUnique(queries, `${query} Wikipedia mountain Japan`);
    pushUnique(queries, `site:ja.wikipedia.org ${query}`);
  } else if (mentionsJapan) {
    pushUnique(queries, `${query} 日本 维基百科`);
    pushUnique(queries, `${query} 日文资料`);
    pushUnique(queries, `${query} 観光 歴史 アクセス`);
    pushUnique(queries, `${query} official tourism Japan`);
    pushUnique(queries, `site:ja.wikipedia.org ${query}`);
  } else if (mentionsPlace) {
    pushUnique(queries, `${query} 维基百科 地理`);
    pushUnique(queries, `${query} 历史 民俗 传说`);
    pushUnique(queries, `${query} 官方 旅游`);
    pushUnique(queries, `${query} 地图 路线`);
    pushUnique(queries, `${query} Wikipedia geography`);
  } else if (hasCjk(query)) {
    pushUnique(queries, `${query} 维基百科`);
    pushUnique(queries, `${query} 官方资料`);
    pushUnique(queries, `${query} 历史 背景`);
    pushUnique(queries, `${query} 英文资料`);
    pushUnique(queries, `${query} 真实案例`);
  } else {
    pushUnique(queries, `${query} wikipedia`);
    pushUnique(queries, `${query} official source`);
    pushUnique(queries, `${query} history background`);
    pushUnique(queries, `${query} geography culture`);
    pushUnique(queries, `${query} primary sources`);
  }

  return queries.slice(0, MAX_EXPANDED_QUERIES);
}

function buildLlmFallbackQuery(query: string, expandedQueries: string[]): string {
  if (expandedQueries.length <= 1) return query;
  return [
    `原始查询：${query}`,
    "系统自动准备的检索方向：",
    ...expandedQueries.map((item, index) => `${index + 1}. ${item}`),
    "请基于这些方向整理概述，并明确给出后续可继续检索的关键词。",
  ].join("\n");
}

function normalizeHitUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return trimmed.replace(/\/$/, "").toLowerCase();
  }
}

function hitKey(hit: ResearchSearchHit): string {
  const url = normalizeHitUrl(hit.url);
  if (url) return `url:${url}`;
  return `text:${hit.title.trim().toLowerCase()}|${hit.snippet.trim().slice(0, 80).toLowerCase()}`;
}

function mergeHits(target: ResearchSearchHit[], incoming: ResearchSearchHit[]): void {
  const existing = new Set(target.map(hitKey));
  for (const hit of incoming) {
    const key = hitKey(hit);
    if (!key || existing.has(key)) continue;
    existing.add(key);
    target.push(hit);
  }
}

function credentialAccount(provider: ResearchProvider): string {
  return `research:${provider}`;
}

async function readCredential(provider: ResearchProvider): Promise<string | null> {
  if (!CREDENTIAL_PROVIDERS.includes(provider)) return null;
  const ctx = getAppContext();
  const encrypted = getResearchCredentialEncrypted(ctx.db, provider);
  return ctx.keystore.getKey(credentialAccount(provider), encrypted);
}

async function writeCredential(
  provider: ResearchProvider,
  apiKey: string,
): Promise<void> {
  if (!CREDENTIAL_PROVIDERS.includes(provider)) {
    throw new Error(`credentials not supported for provider: ${provider}`);
  }
  const ctx = getAppContext();
  const result = await ctx.keystore.setKey(credentialAccount(provider), apiKey);
  upsertResearchCredentialToDB(
    ctx.db,
    provider,
    result.encrypted ?? null,
    result.storedInKeychain,
  );
}

async function removeCredential(provider: ResearchProvider): Promise<void> {
  const ctx = getAppContext();
  await ctx.keystore.deleteKey(credentialAccount(provider));
  deleteResearchCredentialFromDB(ctx.db, provider);
}

async function buildLlmFallbackHits(options: {
  query: string;
  topK: number;
}): Promise<ResearchSearchHit[]> {
  const record = resolveProviderRecord();
  if (!record) {
    throw new Error("llm_fallback_requires_provider");
  }
  const apiKey = await resolveApiKey(record);
  if (!apiKey) {
    throw new Error("llm_fallback_api_key_missing");
  }
  const system = [
    "你是资料综述助手，当前无网络检索 API 可用。",
    "请基于自身训练数据对用户查询给出 3~5 条最有用的综述条目，但不要声称已经联网查证。",
    "遇到地名、外国资料、历史资料时，优先给出中外名称、可能来源类型、可继续检索的关键词。",
    "不确定的事实要标明“需核实”，不要编造链接。",
    "每条必须包含：title（≤20 字）/ url（可留空字符串）/ snippet（80~220 字，指明来源类型和核实方向）。",
    "严格输出 JSON 数组，不要任何注释或 Markdown 围栏。",
  ].join("\n");
  const user = `查询：${options.query}\n期望条目数：${options.topK}`;
  let accumulated = "";
  const stream = streamText({
    providerRecord: record,
    apiKey,
    model: record.defaultModel,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.2,
    maxTokens: 900,
  });
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) {
      accumulated += chunk.textDelta;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error ?? "llm_fallback_stream_error");
    }
  }
  const parsed = tryParseJsonArray(accumulated);
  if (!parsed) {
    throw new Error("llm_fallback_invalid_json");
  }
  return parsed
    .filter(
      (item): item is { title: string; url?: string; snippet?: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { title?: unknown }).title === "string",
    )
    .slice(0, options.topK)
    .map<ResearchSearchHit>((item) => ({
      title: item.title,
      url: typeof item.url === "string" ? item.url : "",
      snippet: typeof item.snippet === "string" ? item.snippet : "",
      provider: "llm-fallback",
    }));
}

function tryParseJsonArray(text: string): unknown[] | null {
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket <= firstBracket) return null;
  const jsonSlice = text.slice(firstBracket, lastBracket + 1);
  try {
    const parsed = JSON.parse(jsonSlice);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let llmFallbackAdapterInstance: ResearchProviderAdapter | null = null;
function getLlmFallbackAdapter(): ResearchProviderAdapter {
  if (!llmFallbackAdapterInstance) {
    llmFallbackAdapterInstance = createLlmFallbackAdapter(buildLlmFallbackHits);
  }
  return llmFallbackAdapterInstance;
}

function adapterFor(provider: ResearchProvider): ResearchProviderAdapter {
  switch (provider) {
    case "tavily":
      return createTavilyAdapter();
    case "bing":
      return createBingAdapter();
    case "serpapi":
      return createSerpapiAdapter();
    case "llm-fallback":
    case "manual":
    default:
      return getLlmFallbackAdapter();
  }
}

async function searchAdapterWithQueries(options: {
  adapter: ResearchProviderAdapter;
  providerId: ResearchProvider;
  query: string;
  expandedQueries: string[];
  topK: number;
  apiKey?: string;
}): Promise<ResearchSearchHit[]> {
  const { adapter, providerId, query, expandedQueries, topK, apiKey } = options;
  const merged: ResearchSearchHit[] = [];
  let lastError: string | undefined;

  const queries =
    providerId === "llm-fallback"
      ? [buildLlmFallbackQuery(query, expandedQueries)]
      : expandedQueries;
  const perQueryTopK =
    providerId === "llm-fallback" ? topK : Math.min(Math.max(Math.ceil(topK / 3), 6), 10);

  for (const searchQuery of queries) {
    try {
      const hits = await adapter.search({
        query: searchQuery,
        topK: perQueryTopK,
        apiKey,
      });
      mergeHits(merged, hits);
      if (merged.length >= topK && providerId !== "llm-fallback") break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(
        `research adapter ${providerId} failed for query "${searchQuery}"`,
        lastError,
      );
    }
  }

  if (merged.length === 0 && lastError) {
    throw new Error(lastError);
  }

  return merged.slice(0, topK);
}

export async function searchResearch(
  input: ResearchSearchInput,
): Promise<ResearchSearchResponse> {
  const query = input.query.trim();
  if (!query) {
    return {
      hits: [],
      usedProvider: "llm-fallback",
      error: "empty_query",
      expandedQueries: [],
      attemptedProviders: [],
    };
  }
  const preferred: ResearchProvider = input.provider ?? "llm-fallback";
  const topK = input.topK ?? 20;
  const expandedQueries = buildResearchQueries(query);

  const attempts: ResearchProvider[] = [preferred];
  if (preferred !== "llm-fallback") attempts.push("llm-fallback");

  let lastError: string | undefined;
  const attemptedProviders: ResearchProvider[] = [];
  for (const providerId of attempts) {
    const adapter = adapterFor(providerId);
    attemptedProviders.push(providerId);
    try {
      const apiKey =
        adapter.requiresApiKey && !input.apiKey
          ? (await readCredential(providerId)) ?? undefined
          : input.apiKey;
      if (adapter.requiresApiKey && !apiKey) {
        lastError = `${providerId}_api_key_missing`;
        continue;
      }
      const hits = await searchAdapterWithQueries({
        adapter,
        providerId,
        query,
        expandedQueries,
        topK,
        apiKey,
      });
      if (hits.length === 0 && providerId !== "llm-fallback") {
        lastError = "no_hits";
        continue;
      }
      const cleanedHits = hits
        .map((h) => ({
          ...h,
          title: cleanSnippet(h.title),
          snippet: cleanSnippet(h.snippet),
        }))
        .filter((h) => {
          // Filter out Wikipedia disambiguation pages
          const combined = `${h.title} ${h.snippet}`;
          if (/消歧[義义]页/.test(combined)) return false;
          if (/羅列了有相同或相近的標題/.test(combined)) return false;
          // Filter out commercial booking/tour sites
          if (/\b(?:From|Starting from)\s*[£€$¥]\d/i.test(h.snippet)) return false;
          if (/Book Tickets & Tours/i.test(h.title)) return false;
          if (/\bgetyourguide\.com\b/i.test(h.url)) return false;
          // Filter out hits whose snippet became nearly empty after cleaning
          if (h.snippet.length < 30 && h.url) return false;
          return true;
        });
      return {
        hits: cleanedHits,
        usedProvider: providerId,
        fellBackToLlm: providerId === "llm-fallback" && preferred !== "llm-fallback",
        error: hits.length === 0 ? "no_hits" : undefined,
        expandedQueries,
        attemptedProviders,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(`research adapter ${providerId} failed`, lastError);
    }
  }

  return {
    hits: [],
    usedProvider: "llm-fallback",
    fellBackToLlm: true,
    error: lastError ?? "all_providers_failed",
    expandedQueries,
    attemptedProviders,
  };
}

export function saveResearchNote(input: ResearchSaveInput): ResearchNoteRecord {
  const ctx = getAppContext();
  return insertResearchNote(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    topic: input.topic,
    sourceUrl: input.sourceUrl ?? null,
    sourceTitle: input.sourceTitle ?? null,
    sourceProvider: input.sourceProvider,
    excerpt: input.excerpt,
    note: input.note ?? "",
    tags: input.tags ?? [],
  });
}

export function listResearchNoteRecords(
  input: ResearchListInput,
): ResearchNoteRecord[] {
  const ctx = getAppContext();
  return listResearchNotes(ctx.db, {
    projectId: input.projectId,
    topic: input.topic,
    limit: input.limit,
  });
}

export function getResearchNote(input: ResearchGetInput): ResearchNoteRecord | null {
  const ctx = getAppContext();
  return getResearchNoteById(ctx.db, input.id);
}

export function updateResearchNoteRecord(
  input: ResearchUpdateInput,
): ResearchNoteRecord {
  const ctx = getAppContext();
  return updateResearchNote(ctx.db, {
    id: input.id,
    topic: input.topic,
    note: input.note,
    tags: input.tags,
  });
}

export function deleteResearchNoteRecord(
  input: ResearchDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  deleteResearchNote(ctx.db, input.id);
  return { id: input.id };
}

export async function getResearchCredentialStatuses(
  input: ResearchCredentialStatusInput,
): Promise<ResearchCredentialStatus[]> {
  const providers =
    input.providers && input.providers.length > 0
      ? input.providers.filter((p) => CREDENTIAL_PROVIDERS.includes(p))
      : CREDENTIAL_PROVIDERS;
  const results: ResearchCredentialStatus[] = [];
  for (const provider of providers) {
    const key = await readCredential(provider);
    results.push({ provider, configured: !!key });
  }
  return results;
}

export async function upsertResearchCredential(
  input: ResearchCredentialUpsertInput,
): Promise<ResearchCredentialStatus> {
  const trimmed = input.apiKey?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error("apiKey cannot be empty");
  }
  await writeCredential(input.provider, trimmed);
  return { provider: input.provider, configured: true };
}

export async function deleteResearchCredential(
  input: ResearchCredentialDeleteInput,
): Promise<ResearchCredentialStatus> {
  await removeCredential(input.provider);
  return { provider: input.provider, configured: false };
}
