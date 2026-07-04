import { extractTodoMarkers, type EditorTodoMarker } from "@inkforge/editor";
import { normalizeRhythmSnippet } from "./manual-writing-rhythm";

export interface ManualRevisionQueueItem extends EditorTodoMarker {
  preview: string;
}

export function buildManualRevisionQueueItems(
  chapterId: string,
  content: string,
): ManualRevisionQueueItem[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  return extractTodoMarkers(chapterId, content).map((marker) => ({
    ...marker,
    preview: normalizeRhythmSnippet(lines[marker.line - 1] ?? "", 96),
  }));
}
