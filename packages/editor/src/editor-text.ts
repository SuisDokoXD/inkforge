export function escapeEditorHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeEditorText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00A0\u3000]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function normalizePastedText(text: string): string {
  return normalizeEditorText(text)
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

export const FULL_WIDTH_SPACE = "\u3000";
export const DEFAULT_PARAGRAPH_INDENT = FULL_WIDTH_SPACE + FULL_WIDTH_SPACE;

export interface EditorTodoMarker {
  id: string;
  chapterId: string;
  title: string;
  line: number;
  raw: string;
  occurrence: number;
}

export function isPlainTextHeadingLine(line: string): boolean {
  return /^\s{0,3}#{1,4}\s+\S/.test(normalizeEditorText(line));
}

export function isSceneBreakLine(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(normalizeEditorText(line).trim());
}

export function getLeadingEditorIndent(line: string): string {
  const match = line.match(/^[ \u3000]+/);
  return match ? match[0].replace(/ /g, FULL_WIDTH_SPACE) : "";
}

export function getNextEditorLineIndent(currentLine: string): string {
  const normalized = normalizeEditorText(currentLine);
  if (!normalized.trim()) return "";
  if (isPlainTextHeadingLine(currentLine) || isSceneBreakLine(currentLine)) return "";
  return getLeadingEditorIndent(currentLine) || DEFAULT_PARAGRAPH_INDENT;
}

export function getFullWidthIndentDeleteCount(textBeforeCursor: string): number {
  if (!/^[ \u3000]+$/.test(textBeforeCursor)) return 0;
  if (textBeforeCursor.endsWith(DEFAULT_PARAGRAPH_INDENT)) return DEFAULT_PARAGRAPH_INDENT.length;
  return textBeforeCursor.endsWith(FULL_WIDTH_SPACE) || textBeforeCursor.endsWith(" ") ? 1 : 0;
}

export function extractTodoMarkers(chapterId: string, text: string): EditorTodoMarker[] {
  const markers: EditorTodoMarker[] = [];
  const occurrences = new Map<string, number>();
  const occurrenceFor = (raw: string): number => {
    const current = occurrences.get(raw) ?? 0;
    occurrences.set(raw, current + 1);
    return current;
  };

  text.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
    const lineNo = index + 1;
    const chinesePattern = /\u3010\u5f85\u8865[:\uff1a]?\s*([^\u3011]*)\u3011/gu;
    let match: RegExpExecArray | null;
    while ((match = chinesePattern.exec(line)) !== null) {
      const raw = match[0];
      const title = match[1].trim() || "\u5f85\u8865";
      markers.push({
        id: `${chapterId}:${lineNo}:${markers.length}`,
        chapterId,
        title,
        line: lineNo,
        raw,
        occurrence: occurrenceFor(raw),
      });
    }

    const todoMatch = line.match(/\bTODO[:\uff1a]\s*(.+)$/iu);
    if (todoMatch) {
      const raw = todoMatch[0];
      markers.push({
        id: `${chapterId}:${lineNo}:${markers.length}`,
        chapterId,
        title: todoMatch[1].trim() || "TODO",
        line: lineNo,
        raw,
        occurrence: occurrenceFor(raw),
      });
    }
  });

  return markers;
}

export function normalizeManualSelection(text: string): string {
  const normalizedLines = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => {
      const withoutTrailing = line.replace(/[ \t\u00A0]+$/g, "");
      return withoutTrailing.replace(/^[ \t\u00A0]+/, (indent) =>
        indent.replace(/\t/g, "  ").replace(/[ \u00A0]/g, FULL_WIDTH_SPACE),
      );
    })
    .join("\n");

  return normalizedLines.replace(/\n{3,}/g, "\n\n");
}

export function plainTextToEditorHtml(text: string): string {
  if (!text) return "<p></p>";
  return normalizeEditorText(text)
    .split(/\n\n+/)
    .map((para) => {
      const escaped = escapeEditorHtml(para);
      const lines = escaped.split("\n").map((line) =>
        line.replace(/^( +)/, (m) => "\u3000".repeat(m.length)),
      );
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}