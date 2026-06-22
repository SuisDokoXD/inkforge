import type { WritingConflictAnalysis } from "./types";

const ROOT_CAUSES = new Set([
  "outline-history",
  "constraint-history",
  "world-history",
  "foreshadow-outline",
  "mixed",
  "other",
]);

const ACTION_IDS = new Set(["edit-outline", "adjust-constraints", "retry", "keep-draft"]);

function stripJsonFence(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function normalizeRootCause(value: unknown): WritingConflictAnalysis["rootCause"] {
  const text = String(value ?? "").trim();
  return ROOT_CAUSES.has(text) ? (text as WritingConflictAnalysis["rootCause"]) : "other";
}

function normalizeAction(value: unknown): WritingConflictAnalysis["suggestedActions"][number] | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id ?? "").trim();
  if (!ACTION_IDS.has(id)) return null;
  const label = String(item.label ?? "").trim() || defaultActionLabel(id);
  const description = String(item.description ?? "").trim() || label;
  return {
    id: id as WritingConflictAnalysis["suggestedActions"][number]["id"],
    label,
    description,
  };
}

function defaultActionLabel(id: string): string {
  if (id === "edit-outline") return "调整大纲";
  if (id === "adjust-constraints") return "修正要求";
  if (id === "retry") return "重新生成";
  return "保留草稿";
}

function fallbackAnalysis(reason: string): WritingConflictAnalysis {
  return {
    reconcilable: false,
    summary: reason,
    rootCause: "other",
    extraConstraints: "",
    suggestedActions: [
      {
        id: "keep-draft",
        label: "保留草稿",
        description: "保留当前正文，稍后人工复核问题。",
      },
    ],
  };
}

export function parseWritingConflictAnalysis(raw: string): WritingConflictAnalysis {
  const rawText = raw ?? "";
  const text = stripJsonFence(rawText);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return fallbackAnalysis("写作冲突分析返回内容不是对象，需要人工复核。");
    }
    const obj = parsed as Record<string, unknown>;
    const actions = Array.isArray(obj.suggestedActions)
      ? obj.suggestedActions
          .map((item) => normalizeAction(item))
          .filter((item): item is WritingConflictAnalysis["suggestedActions"][number] => item !== null)
      : [];
    return {
      reconcilable: Boolean(obj.reconcilable),
      summary: String(obj.summary ?? "").trim() || "写作冲突分析没有给出摘要，需要人工复核。",
      rootCause: normalizeRootCause(obj.rootCause),
      extraConstraints: String(obj.extraConstraints ?? "").trim(),
      suggestedActions: actions.length > 0 ? actions : fallbackAnalysis("").suggestedActions,
    };
  } catch {
    const fallback = rawText.trim();
    return fallbackAnalysis(
      fallback
        ? `写作冲突分析返回内容无法解析，需要人工复核：${fallback.slice(0, 200)}`
        : "写作冲突分析没有返回内容，需要人工复核。",
    );
  }
}
