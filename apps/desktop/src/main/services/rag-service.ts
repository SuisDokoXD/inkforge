import {
  listSampleChunks,
  listSampleLibs,
  ragSearchCharacters,
  ragSearchResearchNotes,
  ragSearchSampleChunks,
  ragSearchWorldEntries,
  type CharacterHit,
  type ResearchHit,
  type SampleChunkHit,
  type WorldEntryHit,
} from "@inkforge/storage";
import { getAppContext } from "./app-state";

const MAX_PER_ENTRY = 800;
const MAX_TOTAL_CHARS = 2400;
const MAX_HITS_PER_SOURCE = 5;
const MAX_SAMPLE_REFERENCE_CHARS = 2200;
const MAX_SAMPLE_REFERENCE_HITS = 3;

export interface BuildRagBlockOptions {
  /** Toggle each source individually; defaults: all true. */
  worldEntries?: boolean;
  characters?: boolean;
  researchNotes?: boolean;
  sampleChunks?: boolean;
  /** Override caps. */
  maxPerEntry?: number;
  maxTotalChars?: number;
  maxHitsPerSource?: number;
}

export interface SampleReference {
  source: string;
  excerpt: string;
}

export interface BuildSampleReferenceOptions {
  maxPerEntry?: number;
  maxTotalChars?: number;
  maxHits?: number;
  fallbackToImported?: boolean;
  sampleLibIds?: string[];
}

function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}

/**
 * Extract 2-4 keyword phrases from the query for LIKE matching.
 *
 * Heuristic: take the last N chars (most recent context), strip punctuation,
 * tokenize on Chinese 2-char + ASCII word boundaries, dedupe, cap to 8 tokens.
 * Falls back to first chars if last is punctuation-heavy.
 */
function extractQueries(query: string): string[] {
  if (!query) return [];
  const tail = query.slice(-300);
  const cleaned = tail.replace(/[\s\p{P}]+/gu, " ").trim();
  if (!cleaned) return [];
  const tokens = new Set<string>();
  // Sliding 2-char Chinese windows
  const chinese = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const seg of chinese) {
    for (let i = 0; i + 2 <= seg.length && tokens.size < 8; i += 1) {
      tokens.add(seg.slice(i, i + 2));
    }
  }
  // ASCII words >= 3 chars
  const ascii = cleaned.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const w of ascii) {
    if (tokens.size >= 8) break;
    tokens.add(w.toLowerCase());
  }
  return [...tokens];
}

interface RenderedSection {
  header: string;
  lines: string[];
}

function renderWorld(hits: WorldEntryHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 世界观 ===",
    lines: hits.map(
      (h) => `${h.title} (${h.category})：${clip(h.content || "(无描述)", maxPer)}`,
    ),
  };
}

function renderCharacters(hits: CharacterHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 人物 ===",
    lines: hits.map((h) => {
      const parts: string[] = [];
      if (h.persona) parts.push(`性格：${clip(h.persona, 200)}`);
      if (h.backstory) parts.push(`背景：${clip(h.backstory, maxPer - 200)}`);
      const summary = parts.length ? parts.join("；") : "(无资料)";
      return `${h.name}：${summary}`;
    }),
  };
}

function renderResearch(hits: ResearchHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 网搜资料 ===",
    lines: hits.map((h) => {
      const body = h.note || h.excerpt || "";
      return `${h.topic}：${clip(body || "(无内容)", maxPer)}`;
    }),
  };
}

function renderSamples(hits: SampleChunkHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 参考节选 ===",
    lines: hits.map((h) => {
      const tag = `[from 《${h.libTitle}》${h.libAuthor ? `· ${h.libAuthor}` : ""}${h.chapterTitle ? ` · ${h.chapterTitle}` : ""}]`;
      return `${tag} ${clip(h.text, maxPer)}`;
    }),
  };
}

function sampleHitSource(hit: SampleChunkHit): string {
  return [hit.libTitle, hit.libAuthor, hit.chapterTitle].filter(Boolean).join(" · ");
}

function normalizeLibFilter(sampleLibIds?: string[]): Set<string> | null {
  const ids = (sampleLibIds ?? []).map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function dedupeSampleHits(hits: SampleChunkHit[]): SampleChunkHit[] {
  const seen = new Set<string>();
  const unique: SampleChunkHit[] = [];
  for (const hit of hits) {
    const key = `${hit.libTitle}\n${hit.libAuthor ?? ""}\n${hit.chapterTitle ?? ""}\n${hit.text.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

function scoreSampleCandidate(input: {
  libTitle: string;
  libAuthor: string | null;
  libNotes: string | null;
  chapterTitle: string | null;
  text: string;
  queries: string[];
}): number {
  if (input.queries.length === 0) return 0;
  const haystack = [
    input.libTitle,
    input.libAuthor ?? "",
    input.libNotes ?? "",
    input.chapterTitle ?? "",
    input.text.slice(0, 1400),
  ]
    .join(" ")
    .toLowerCase();
  return input.queries.reduce((score, query) => {
    const q = query.toLowerCase();
    return q && haystack.includes(q) ? score + 2 : score;
  }, 0);
}

function fallbackSampleHits(
  projectId: string,
  limit: number,
  queries: string[],
  sampleLibIds?: string[],
): SampleChunkHit[] {
  const ctx = getAppContext();
  const candidates: Array<SampleChunkHit & { libId: string; score: number }> = [];
  const libFilter = normalizeLibFilter(sampleLibIds);
  const libs = listSampleLibs(ctx.db, projectId).filter(
    (lib) => !libFilter || libFilter.has(lib.id),
  );
  for (const lib of libs) {
    const chunks = listSampleChunks(ctx.db, lib.id);
    for (const chunk of chunks) {
      const text = chunk.text.trim();
      if (text.length < 40) continue;
      candidates.push({
        libId: lib.id,
        libTitle: lib.title,
        libAuthor: lib.author,
        chapterTitle: chunk.chapterTitle,
        text,
        score: scoreSampleCandidate({
          libTitle: lib.title,
          libAuthor: lib.author,
          libNotes: lib.notes,
          chapterTitle: chunk.chapterTitle,
          text,
          queries,
        }),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const hits: SampleChunkHit[] = [];
  const usedLibs = new Set<string>();
  for (const candidate of candidates) {
    if (hits.length >= limit) break;
    if (candidate.score > 0 && usedLibs.has(candidate.libId)) continue;
    usedLibs.add(candidate.libId);
    hits.push({
      libId: candidate.libId,
      libTitle: candidate.libTitle,
      libAuthor: candidate.libAuthor,
      chapterTitle: candidate.chapterTitle,
      text: candidate.text,
    });
  }

  for (const candidate of candidates) {
    if (hits.length >= limit) break;
    if (hits.some((hit) => hit.text === candidate.text)) continue;
    hits.push({
      libId: candidate.libId,
      libTitle: candidate.libTitle,
      libAuthor: candidate.libAuthor,
      chapterTitle: candidate.chapterTitle,
      text: candidate.text,
    });
  }
  return hits;
}

export function findSampleReferences(
  projectId: string | undefined,
  query: string,
  opts: BuildSampleReferenceOptions = {},
): SampleReference[] {
  if (!projectId) return [];

  const maxHits = opts.maxHits ?? MAX_SAMPLE_REFERENCE_HITS;
  const maxPer = opts.maxPerEntry ?? 650;
  const fallbackEnabled = opts.fallbackToImported !== false;
  const libFilter = normalizeLibFilter(opts.sampleLibIds);
  const ctx = getAppContext();
  const queries = extractQueries(query);
  let hits: SampleChunkHit[] = [];

  if (queries.length > 0) {
    try {
      hits = ragSearchSampleChunks(ctx.db, projectId, queries, maxHits);
      if (libFilter) hits = hits.filter((hit) => libFilter.has(hit.libId));
    } catch {
      hits = [];
    }
  }

  if (fallbackEnabled && hits.length < maxHits) {
    hits = dedupeSampleHits([
      ...hits,
      ...fallbackSampleHits(projectId, maxHits - hits.length, queries, opts.sampleLibIds),
    ]);
  }

  return hits.slice(0, maxHits).map((hit) => ({
    source: sampleHitSource(hit) || "导入文集",
    excerpt: clip(hit.text, maxPer),
  }));
}

export function buildSampleReferenceBlock(
  projectId: string | undefined,
  query: string,
  opts: BuildSampleReferenceOptions = {},
): string {
  const maxTotal = opts.maxTotalChars ?? MAX_SAMPLE_REFERENCE_CHARS;
  const samples = findSampleReferences(projectId, query, opts);
  if (samples.length === 0) return "";

  const out: string[] = [
    "【参考文集技法摘录 · 只学习叙事技法、场景密度与意象组织；不要复制原文，也不要复刻特定作者的可识别风格】",
    "",
    "=== 导入文集节选 ===",
  ];
  let total = out.join("\n").length;
  for (const sample of samples) {
    const line = `【${sample.source}】\n${sample.excerpt}`;
    const remaining = maxTotal - total;
    if (remaining <= 0) break;
    out.push("");
    out.push(line.length > remaining ? line.slice(0, remaining).trimEnd() + "…" : line);
    total += line.length;
  }
  out.push("");
  return out.join("\n");
}

/**
 * Build a 【参考资料】 block to be prepended to user prompt.
 * Returns "" when no hits in any enabled source (avoid noise).
 */
export function buildRagBlock(
  projectId: string | undefined,
  query: string,
  opts: BuildRagBlockOptions = {},
): string {
  if (!projectId || !query) return "";

  const enableWorld = opts.worldEntries !== false;
  const enableChar = opts.characters !== false;
  const enableResearch = opts.researchNotes !== false;
  const enableSamples = opts.sampleChunks !== false;
  const maxPer = opts.maxPerEntry ?? MAX_PER_ENTRY;
  const maxTotal = opts.maxTotalChars ?? MAX_TOTAL_CHARS;
  const maxHits = opts.maxHitsPerSource ?? MAX_HITS_PER_SOURCE;

  const queries = extractQueries(query);
  if (queries.length === 0) return "";

  const ctx = getAppContext();
  const sections: RenderedSection[] = [];

  if (enableWorld) {
    const hits = ragSearchWorldEntries(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderWorld(hits, maxPer));
  }
  if (enableChar) {
    const hits = ragSearchCharacters(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderCharacters(hits, maxPer));
  }
  if (enableResearch) {
    const hits = ragSearchResearchNotes(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderResearch(hits, maxPer));
  }
  if (enableSamples) {
    const hits = ragSearchSampleChunks(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderSamples(hits, maxPer));
  }

  if (sections.length === 0) return "";

  // Render with global cap
  const out: string[] = ["【参考资料 · 仅供参考，不要复制原文】"];
  let total = 0;
  for (const sec of sections) {
    const headerLine = sec.header;
    if (total + headerLine.length > maxTotal) break;
    out.push("");
    out.push(headerLine);
    total += headerLine.length;
    for (const line of sec.lines) {
      const remaining = maxTotal - total;
      if (remaining <= 0) break;
      const truncated = line.length > remaining ? line.slice(0, remaining) + "…" : line;
      out.push(truncated);
      total += truncated.length;
    }
  }
  out.push("");
  return out.join("\n");
}
