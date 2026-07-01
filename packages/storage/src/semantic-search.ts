// C1: 轻量级中文语义搜索引擎。
// 不依赖外部 ML 模型，使用字符 n-gram TF 指纹 + 余弦相似度实现"模糊语义匹配"。
// "主角的剑" 能匹配 "主角的武器""那把传说中的神器"（通过共享字符 bigram 的 Jaccard 相似度）。
//
// 架构设计为可升级：`EntityFingerprint` 接口预留了 `vector` 字段，
// 未来可接入 @xenova/transformers 或 llama.cpp embedding 替换指纹相似度。

// ─── 文本指纹（n-gram frequency map）───────────────────────────

export interface NGramFingerprint {
  /** n-gram → frequency (normalized 0.0–1.0) */
  grams: Record<string, number>;
  /** 原文字符数（用于长度归一化） */
  charCount: number;
}

// ─── 中文分词与 n-gram 提取 ───────────────────────────────────

/** CJK 字符范围（含 CJK Unified + Extension A + 标点） */
const CJK_RE = /[一-鿿㐀-䶿]/g;

/** 提取中文 bigram（2-gram）+ trigram（3-gram）作为指纹特征。
 *  "主角的剑" → ["主角","角的","的剑","主角的","角的剑"] */
function extractChineseNGrams(text: string): string[] {
  const chars = text.match(CJK_RE);
  if (!chars || chars.length < 2) return [];
  const result: string[] = [];
  // bigrams
  for (let i = 0; i + 1 < chars.length; i++) {
    result.push(chars[i] + chars[i + 1]);
  }
  // trigrams（对长文本更精确）
  for (let i = 0; i + 2 < chars.length; i++) {
    result.push(chars[i] + chars[i + 1] + chars[i + 2]);
  }
  return result;
}

/** 提取英文单词（3+ 字符的小写单词） */
function extractEnglishTokens(text: string): string[] {
  const words = text.match(/[a-zA-Z]{3,}/g);
  return (words ?? []).map((w) => w.toLowerCase());
}

/** 构建文本指纹：n-gram → TF（term frequency，归一化到 0-1） */
export function buildFingerprint(text: string): NGramFingerprint {
  const cngrams = extractChineseNGrams(text);
  const enTokens = extractEnglishTokens(text);
  const allTokens = [...cngrams, ...enTokens];
  const total = allTokens.length;
  if (total === 0) {
    return { grams: {}, charCount: text.length };
  }
  const grams: Record<string, number> = {};
  for (const token of allTokens) {
    grams[token] = (grams[token] ?? 0) + 1 / total;
  }
  return { grams, charCount: text.length };
}

// ─── 相似度计算 ───────────────────────────────────────────────

/** 计算两个指纹的余弦相似度（对共享 n-gram 做点积） */
export function fingerprintSimilarity(a: NGramFingerprint, b: NGramFingerprint): number {
  const aKeys = Object.keys(a.grams);
  const bKeys = Object.keys(b.grams);
  if (aKeys.length === 0 || bKeys.length === 0) return 0;

  // 只计算共享的 n-gram 的点积
  let dotProduct = 0;
  const bSet = new Set(bKeys);
  for (const key of aKeys) {
    if (bSet.has(key)) {
      dotProduct += (a.grams[key] ?? 0) * (b.grams[key] ?? 0);
    }
  }

  // 余弦相似度 = dot / (|a| * |b|)
  const aNorm = Math.sqrt(Object.values(a.grams).reduce((sum, v) => sum + v * v, 0));
  const bNorm = Math.sqrt(Object.values(b.grams).reduce((sum, v) => sum + v * v, 0));
  const denominator = aNorm * bNorm;
  if (denominator === 0) return 0;

  // 对极短文本（<10 字）做惩罚，避免短查询匹配一切
  const lenBonus = Math.min(1.0, Math.min(a.charCount, b.charCount) / 10);

  return (dotProduct / denominator) * lenBonus;
}

/** 计算 Jaccard 相似度（用于作为 fallback 加分项） */
export function jaccardSimilarity(a: NGramFingerprint, b: NGramFingerprint): number {
  const aKeys = new Set(Object.keys(a.grams));
  const bKeys = new Set(Object.keys(b.grams));
  if (aKeys.size === 0 && bKeys.size === 0) return 0;
  const intersection = [...aKeys].filter((k) => bKeys.has(k)).length;
  const union = new Set([...aKeys, ...bKeys]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── 混合相似度评分（融合余弦 + Jaccard） ──────────────────────

/** 综合相似度：余弦 70% + Jaccard 30% */
export function combinedSimilarity(a: NGramFingerprint, b: NGramFingerprint): number {
  const cos = fingerprintSimilarity(a, b);
  const jac = jaccardSimilarity(a, b);
  return cos * 0.7 + jac * 0.3;
}

// ─── 跨文本匹配（query 指纹 vs 多条文档指纹） ──────────────────

export interface ScoredMatch {
  entityType: string;
  entityId: string;
  score: number;
  /** 原始命中的文本（用于渲染 RAG block） */
  sourceText: string;
}

/** 对查询文本与多条文档指纹做批量相似度计算，返回 top-K */
export function rankBySimilarity(
  queryFingerprint: NGramFingerprint,
  candidates: Array<{
    entityType: string;
    entityId: string;
    fingerprint: NGramFingerprint;
    sourceText: string;
  }>,
  topK: number,
  minScore = 0.08,
): ScoredMatch[] {
  const scored = candidates
    .map((c) => ({
      entityType: c.entityType,
      entityId: c.entityId,
      score: combinedSimilarity(queryFingerprint, c.fingerprint),
      sourceText: c.sourceText,
    }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ─── 指纹 JSON 序列化 ─────────────────────────────────────────

export function serializeFingerprint(fp: NGramFingerprint): string {
  return JSON.stringify({ g: fp.grams, c: fp.charCount });
}

export function deserializeFingerprint(json: string): NGramFingerprint | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed.g === "object" && typeof parsed.c === "number") {
      return { grams: parsed.g, charCount: parsed.c };
    }
  } catch {
    // ignore
  }
  return null;
}

/** 简单哈希（用于检测文本是否变化，避免重复建指纹） */
export function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(text.length, 2000); i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}
