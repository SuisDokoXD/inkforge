export interface TextFindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}
export interface TextFindMatch {
  index: number;
  length: number;
  text: string;
}
function isWordChar(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{N}_]/u.test(char);
}
function isWholeWordMatch(text: string, index: number, length: number): boolean {
  return !isWordChar(text[index - 1]) && !isWordChar(text[index + length]);
}
export function findTextMatches(
  text: string,
  query: string,
  options: TextFindOptions,
): TextFindMatch[] {
  if (!query) return [];
  const haystack = options.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const matches: TextFindMatch[] = [];
  let cursor = 0;
  while (cursor <= haystack.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    if (!options.wholeWord || isWholeWordMatch(text, index, query.length)) {
      matches.push({
        index,
        length: query.length,
        text: text.slice(index, index + query.length),
      });
    }
    cursor = index + Math.max(needle.length, 1);
  }
  return matches;
}

