import { extractTodoMarkers, isSceneBreakLine, type EditorTodoMarker } from "@inkforge/editor";

export type ManualChapterMapItemKind = "heading" | "scene" | "todo";
export type ManualChapterMapFilter = "all" | ManualChapterMapItemKind;

export interface ManualChapterMapItem {
  id: string;
  kind: ManualChapterMapItemKind;
  line: number;
  label: string;
  raw: string;
  occurrence: number;
  level?: number;
}

const HEADING_PATTERN = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/;

function occurrenceFor(occurrences: Map<string, number>, raw: string): number {
  const current = occurrences.get(raw) ?? 0;
  occurrences.set(raw, current + 1);
  return current;
}

function sceneLabel(index: number): string {
  return `场景 ${index}`;
}

function todoToMapItem(marker: EditorTodoMarker): ManualChapterMapItem {
  return {
    id: `todo:${marker.id}`,
    kind: "todo",
    line: marker.line,
    label: marker.title,
    raw: marker.raw,
    occurrence: marker.occurrence,
  };
}

export function extractManualChapterMap(chapterId: string, content: string): ManualChapterMapItem[] {
  const items: ManualChapterMapItem[] = [];
  const headingOccurrences = new Map<string, number>();
  const sceneOccurrences = new Map<string, number>();
  let sceneCount = 0;

  content.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
    const lineNo = index + 1;
    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      const label = headingMatch[2].trim();
      if (label) {
        items.push({
          id: `heading:${chapterId}:${lineNo}:${items.length}`,
          kind: "heading",
          line: lineNo,
          label,
          raw: line.trim(),
          occurrence: occurrenceFor(headingOccurrences, line.trim()),
          level: headingMatch[1].length,
        });
      }
    }

    const rawScene = line.trim();
    if (rawScene && isSceneBreakLine(rawScene)) {
      sceneCount += 1;
      items.push({
        id: `scene:${chapterId}:${lineNo}:${sceneCount}`,
        kind: "scene",
        line: lineNo,
        label: sceneLabel(sceneCount),
        raw: rawScene,
        occurrence: occurrenceFor(sceneOccurrences, rawScene),
      });
    }
  });

  for (const marker of extractTodoMarkers(chapterId, content)) {
    items.push(todoToMapItem(marker));
  }

  return items.sort((a, b) => a.line - b.line || kindOrder(a.kind) - kindOrder(b.kind));
}

export function filterManualChapterMapItems(
  items: ManualChapterMapItem[],
  filter: ManualChapterMapFilter,
): ManualChapterMapItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.kind === filter);
}

export function currentManualChapterMapItem(
  items: ManualChapterMapItem[],
  lineNumber: number,
): ManualChapterMapItem | null {
  const line = Math.max(1, Math.round(lineNumber) || 1);
  let current: ManualChapterMapItem | null = null;
  for (const item of items) {
    if (item.line > line) break;
    current = item;
  }
  return current;
}

function kindOrder(kind: ManualChapterMapItemKind): number {
  if (kind === "heading") return 0;
  if (kind === "scene") return 1;
  return 2;
}
