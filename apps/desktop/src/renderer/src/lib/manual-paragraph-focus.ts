import { countGraphemes } from "@inkforge/editor";
import { normalizeHandoffNote, normalizeNextBeat, normalizeRhythmSnippet } from "./manual-writing-rhythm";

export const MANUAL_PARAGRAPH_FOCUS_LONG_GRAPHEMES = 600;

export interface ManualParagraphFocusItem {
  index: number;
  startLine: number;
  endLine: number;
  graphemes: number;
  preview: string;
  jumpText: string;
  hasTodo: boolean;
  isLong: boolean;
}

export interface ManualParagraphFocusOverview {
  current: ManualParagraphFocusItem | null;
  previous: ManualParagraphFocusItem | null;
  next: ManualParagraphFocusItem | null;
  beatText: string;
  handoffNote: string;
}

interface ParagraphDraft {
  startLine: number;
  endLine: number;
  lines: string[];
}

function hasTodoMarker(text: string): boolean {
  return /【待补：[^】]*】|TODO\s*:/i.test(text);
}

function paragraphFromDraft(draft: ParagraphDraft, index: number): ManualParagraphFocusItem {
  const text = draft.lines.join("\n").trim();
  const graphemes = countGraphemes(text);
  return {
    index,
    startLine: draft.startLine,
    endLine: draft.endLine,
    graphemes,
    preview: normalizeRhythmSnippet(text, 96),
    jumpText: normalizeRhythmSnippet(text, 60),
    hasTodo: hasTodoMarker(text),
    isLong: graphemes >= MANUAL_PARAGRAPH_FOCUS_LONG_GRAPHEMES,
  };
}

export function extractManualParagraphFocusItems(content: string): ManualParagraphFocusItem[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: ManualParagraphFocusItem[] = [];
  let draft: ParagraphDraft | null = null;

  const flush = () => {
    if (!draft) return;
    const text = draft.lines.join("\n").trim();
    if (text) paragraphs.push(paragraphFromDraft(draft, paragraphs.length));
    draft = null;
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!line.trim()) {
      flush();
      return;
    }
    if (!draft) {
      draft = { startLine: lineNo, endLine: lineNo, lines: [line] };
      return;
    }
    draft.endLine = lineNo;
    draft.lines.push(line);
  });
  flush();

  return paragraphs;
}

export function buildManualParagraphFocusOverview(
  content: string,
  currentLine: number,
): ManualParagraphFocusOverview {
  const paragraphs = extractManualParagraphFocusItems(content);
  if (paragraphs.length === 0) {
    return { current: null, previous: null, next: null, beatText: "", handoffNote: "" };
  }

  const line = Math.max(1, Math.round(currentLine) || 1);
  let currentIndex = paragraphs.findIndex((item) => item.startLine <= line && item.endLine >= line);
  if (currentIndex < 0) {
    let previousIndex = -1;
    for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
      if ((paragraphs[index]?.endLine ?? 0) < line) {
        previousIndex = index;
        break;
      }
    }
    currentIndex = previousIndex >= 0 ? previousIndex : 0;
  }

  const current = paragraphs[currentIndex] ?? null;
  const previous = currentIndex > 0 ? paragraphs[currentIndex - 1] ?? null : null;
  const next = currentIndex >= 0 ? paragraphs[currentIndex + 1] ?? null : null;
  const beatText = current ? normalizeNextBeat(`续写本段：${current.preview}`) : "";
  const handoffNote = current
    ? normalizeHandoffNote(`本段停在第 ${current.startLine} 行：${current.preview}`)
    : "";

  return { current, previous, next, beatText, handoffNote };
}