// =============================================================================
// 卡牌融合 · LLM 输出解析
// =============================================================================
// 从 LLM 原始文本里抽出 JSON 并归一化为可消费的 FusionSuggestion。
// 纯函数 + 无 I/O，便于单测：投喂各种"带 code fence / 带前后废话 / 字段缺失"
// 的真实 LLM 输出样本验证。
// =============================================================================

import type { WorldPackFuseResponse } from "@inkforge/shared";

export type FusionSuggestion = WorldPackFuseResponse["suggestion"];

// 从 LLM 文本里挖出 JSON 对象。
// 容错路径（按优先级）：
//   1. 直接 JSON.parse 整段
//   2. 剥 ```json ... ``` 或 ``` ... ``` 码块再 parse
//   3. 截取首个 `{` 到最后一个 `}` 之间内容再 parse
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fallthrough */
  }
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fallthrough */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fallthrough */
    }
  }
  throw new Error("LLM 输出不是合法 JSON");
}

// 校验 + 归一化 LLM 输出。任何字段类型错位或缺失都退化为安全默认值，永不抛错。
// 这样即便 LLM 输出 60% 正确，剩余 40% 也能落库，避免一次重试浪费。
export function normalizeSuggestion(raw: unknown): FusionSuggestion {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const asStringArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map((e) => {
        const er = (e ?? {}) as Record<string, unknown>;
        return {
          category: typeof er.category === "string" ? er.category : "其他",
          title: typeof er.title === "string" ? er.title : "未命名",
          content: typeof er.content === "string" ? er.content : "",
          aliases: asStringArr(er.aliases),
          keys: asStringArr(er.keys),
        };
      })
    : [];
  return {
    name: typeof obj.name === "string" ? obj.name : "融合卡牌",
    tagline: typeof obj.tagline === "string" ? obj.tagline : "",
    description: typeof obj.description === "string" ? obj.description : "",
    tags: asStringArr(obj.tags),
    entries,
  };
}

// 主入口：raw text → FusionSuggestion；抛错时附带原始片段方便排查
export function parseFusionOutput(raw: string): FusionSuggestion {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(raw);
  } catch (err) {
    const preview = raw.slice(0, 500).replace(/\n/g, "\\n");
    throw new Error(
      `fusion JSON parse failed: ${err instanceof Error ? err.message : err}; raw preview: ${preview}`,
    );
  }
  return normalizeSuggestion(parsed);
}
