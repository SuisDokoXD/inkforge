export interface ChapterHeadingItem {
  id: string;
  title: string;
  line: number;
  level?: number;
}

export function extractChapterHeadings(chapterId: string, content: string): ChapterHeadingItem[] {
  const headings: ChapterHeadingItem[] = [];
  const lines = content.split(/\r?\n/);
  const headingPattern = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/;
  lines.forEach((line, index) => {
    const match = line.match(headingPattern);
    if (!match) return;
    const level = match[1].length;
    const title = match[2].trim();
    if (!title) return;
    const previous = headings[headings.length - 1];
    if (previous?.title === title) {
      const between = lines.slice(previous.line, index);
      const hasBodyBetween = between.some((item) => item.trim() && !headingPattern.test(item));
      if (!hasBodyBetween) return;
    }
    headings.push({
      id: `${chapterId}:${index}`,
      title,
      line: index + 1,
      level,
    });
  });
  return headings.slice(0, 30);
}
