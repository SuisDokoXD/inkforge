const DEFAULT_DRAFT_TITLE = "AI 生成章节";

export interface PreparedGeneratedChapterDraft {
  title: string;
  cleanedText: string;
  markdown: string;
  wordCount: number;
}

export function countNonWhitespaceGraphemes(text: string): number {
  return Array.from(text).filter((char) => /\S/.test(char)).length;
}

export function tailText(text: string, max = 600): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return "…" + trimmed.slice(-max);
}

function headingTitle(line: string): string | null {
  const match = line.match(/^\s{0,3}#{2,4}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || null;
}

export function removeConsecutiveDuplicateMarkdownHeadings(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let lastHeadingTitle: string | null = null;
  let lastHeadingIndex = -1;

  for (const line of lines) {
    const title = headingTitle(line);
    if (title && lastHeadingTitle === title) {
      const between = kept.slice(lastHeadingIndex + 1);
      const hasBodyBetween = between.some((item) => item.trim() && !headingTitle(item));
      if (!hasBodyBetween) continue;
    }
    kept.push(line);
    if (title) {
      lastHeadingTitle = title;
      lastHeadingIndex = kept.length - 1;
    }
  }

  return kept.join("\n").trim();
}

export function prepareGeneratedChapterDraft(input: {
  title: string;
  text: string;
  fallbackTitle?: string;
}): PreparedGeneratedChapterDraft {
  const title = input.title.trim() || input.fallbackTitle?.trim() || DEFAULT_DRAFT_TITLE;
  const cleanedText = removeConsecutiveDuplicateMarkdownHeadings(input.text);
  return {
    title,
    cleanedText,
    markdown: `# ${title}\n\n${cleanedText}\n`,
    wordCount: countNonWhitespaceGraphemes(cleanedText),
  };
}
