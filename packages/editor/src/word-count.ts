export type CountMode = "grapheme" | "word";

export interface WordCountStats {
  /** Meaningful visible graphemes, excluding whitespace/control formatting. */
  graphemes: number;
  words: number;
  chinese: number;
  /** Raw UTF-16 length for diagnostics and low-level comparisons. */
  characters: number;
}

const segmenterCache: Map<string, Intl.Segmenter> = new Map();

function getSegmenter(granularity: "grapheme" | "word"): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter === "undefined") {
    return null;
  }
  const key = granularity;
  let segmenter = segmenterCache.get(key);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(undefined, { granularity });
    segmenterCache.set(key, segmenter);
  }
  return segmenter;
}

export function countGraphemes(text: string): number {
  const segmenter = getSegmenter("grapheme");
  if (!segmenter) return [...text].filter((ch) => /\S/u.test(ch)).length;
  let count = 0;
  for (const segment of segmenter.segment(text)) {
    if (/\S/u.test(segment.segment)) count += 1;
  }
  return count;
}

export function countWords(text: string): number {
  const segmenter = getSegmenter("word");
  if (!segmenter) return text.trim() ? text.trim().split(/\s+/).length : 0;
  let count = 0;
  for (const segment of segmenter.segment(text)) {
    if ((segment as Intl.SegmentData & { isWordLike?: boolean }).isWordLike) {
      count += 1;
    }
  }
  return count;
}

export function countChineseCharacters(text: string): number {
  const matches = text.match(/\p{Script=Han}/gu);
  return matches ? matches.length : 0;
}

export function computeWordCount(text: string): WordCountStats {
  return {
    graphemes: countGraphemes(text),
    words: countWords(text),
    chinese: countChineseCharacters(text),
    characters: text.length,
  };
}

export function resolveTriggerCount(stats: WordCountStats, language: string): number {
  if (language.startsWith("en")) return stats.words;
  return stats.graphemes;
}
