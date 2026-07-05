import type { ManualChapterMapItem, ManualChapterMapItemKind } from "./manual-chapter-map";

export interface ManualChapterStructureCounts {
  headings: number;
  scenes: number;
  todos: number;
  total: number;
}

export interface ManualChapterStructureSuggestion {
  id: string;
  label: string;
  detail: string;
  beatText: string;
  item: ManualChapterMapItem | null;
}

export interface ManualChapterStructureOverview {
  counts: ManualChapterStructureCounts;
  currentItem: ManualChapterMapItem | null;
  nextItem: ManualChapterMapItem | null;
  suggestions: ManualChapterStructureSuggestion[];
}

function kindLabel(kind: ManualChapterMapItemKind): string {
  if (kind === "heading") return "标题";
  if (kind === "scene") return "场景";
  return "待补";
}

function beatPrefix(kind: ManualChapterMapItemKind, intent: "continue" | "next"): string {
  if (kind === "todo") return "补上";
  if (kind === "scene") return intent === "continue" ? "续写" : "接到";
  return intent === "continue" ? "推进" : "接到";
}

function suggestionForItem(
  item: ManualChapterMapItem,
  intent: "continue" | "next" | "todo",
): ManualChapterStructureSuggestion {
  const labelKind = kindLabel(item.kind);
  const prefix = intent === "todo" ? "处理" : intent === "continue" ? "续写" : "接到";
  const beatPrefixText = intent === "todo" ? "补上" : beatPrefix(item.kind, intent);
  return {
    id: `${intent}:${item.id}`,
    label: `${prefix}${labelKind}：${item.label}`,
    detail: `第 ${item.line} 行`,
    beatText: `${beatPrefixText}：${item.label}`,
    item,
  };
}

function uniqueSuggestions(items: ManualChapterStructureSuggestion[]): ManualChapterStructureSuggestion[] {
  const seenBeatText = new Set<string>();
  const result: ManualChapterStructureSuggestion[] = [];
  for (const item of items) {
    if (seenBeatText.has(item.beatText)) continue;
    seenBeatText.add(item.beatText);
    result.push(item);
    if (result.length >= 3) break;
  }
  return result;
}

export function buildManualChapterStructureOverview(
  items: ManualChapterMapItem[],
  currentLine: number,
): ManualChapterStructureOverview {
  const sorted = [...items].sort((left, right) => left.line - right.line);
  const line = Math.max(1, Math.round(currentLine) || 1);
  const currentItem = [...sorted].reverse().find((item) => item.line <= line) ?? null;
  const nextItem = sorted.find((item) => item.line > line) ?? null;
  const nextTodo = sorted.find((item) => item.kind === "todo" && item.line >= line)
    ?? sorted.find((item) => item.kind === "todo")
    ?? null;

  const suggestions = uniqueSuggestions([
    ...(currentItem ? [suggestionForItem(currentItem, "continue")] : []),
    ...(nextItem ? [suggestionForItem(nextItem, "next")] : []),
    ...(nextTodo ? [suggestionForItem(nextTodo, "todo")] : []),
  ]);

  return {
    counts: {
      headings: sorted.filter((item) => item.kind === "heading").length,
      scenes: sorted.filter((item) => item.kind === "scene").length,
      todos: sorted.filter((item) => item.kind === "todo").length,
      total: sorted.length,
    },
    currentItem,
    nextItem,
    suggestions,
  };
}