import type { OocFinding } from "./types";

export interface PromptConstraintSet {
  requiredTerms: string[];
  forbiddenTerms: string[];
  styleDirectives: string[];
  plotBoundaries: string[];
  rawHardRules: string[];
}

export interface EvaluateSegmentConstraintsInput {
  segmentText: string;
  promptConstraints: PromptConstraintSet;
  requiredTerms?: string[];
}

const MAX_REQUIRED_TERMS = 30;
const MAX_FORBIDDEN_TERMS = 30;
const MAX_STYLE_DIRECTIVES = 12;
const MAX_PLOT_BOUNDARIES = 12;
const MAX_RAW_HARD_RULES = 24;
const MAX_TERM_LENGTH = 30;
const MAX_DIRECTIVE_LENGTH = 160;

const REQUIRED_PATTERN = /必须|务必|一定要|要求|包含|写到|出现|保留|提到|关键词|关键字/;
const FORBIDDEN_PATTERN = /不要出现|不要|不得|禁止|不能|避免|别/;
const STYLE_PATTERN = /风格|文风|语气|节奏|氛围|口吻/;
const BOUNDARY_PATTERN = /保持|不改变|不能让|不得让|不要让|别让/;
const LIST_SEPARATOR_PATTERN = /[、,，;；/|]+|\s+(?:和|及|与)\s+/;

function emptyConstraintSet(): PromptConstraintSet {
  return {
    requiredTerms: [],
    forbiddenTerms: [],
    styleDirectives: [],
    plotBoundaries: [],
    rawHardRules: [],
  };
}

function normalizeItem(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimTerm(text: string): string {
  return normalizeItem(text)
    .replace(/^[\s:："'“”‘’「」『』《》【】\[\]（）()]+/, "")
    .replace(/[\s:："'“”‘’「」『』《》【】\[\]（）()。.!！?？]+$/, "")
    .trim();
}

function isValidTerm(term: string): boolean {
  if (!term) return false;
  if (term.length > MAX_TERM_LENGTH) return false;
  if (/[\n\r。.!！?？；;]/.test(term)) return false;
  if (REQUIRED_PATTERN.test(term) || FORBIDDEN_PATTERN.test(term)) return false;
  return true;
}

function pushUnique(target: string[], value: string, limit: number): void {
  const normalized = normalizeItem(value).slice(0, MAX_DIRECTIVE_LENGTH).trim();
  if (!normalized || target.includes(normalized) || target.length >= limit) return;
  target.push(normalized);
}

function pushTerm(target: string[], value: string, limit: number): void {
  const term = trimTerm(value);
  if (!isValidTerm(term) || target.includes(term) || target.length >= limit) return;
  target.push(term);
}

function splitIntoClauses(text: string): string[] {
  const withHardCueBreaks = text
    .replace(
      /[,，]\s*(?=(?:但|并且|同时|而且)?(?:必须|务必|一定要|要求|关键词|关键字|不要出现|不要|不得|禁止|不能|避免|别|保持|不改变|不能让|不得让|不要让|别让))/gu,
      "。",
    );
  return withHardCueBreaks
    .replace(/\r\n/g, "\n")
    .split(/[\n。.!！?？；;]+/)
    .map((item) => normalizeItem(item))
    .filter(Boolean);
}

function extractQuotedTerms(text: string): string[] {
  const terms: string[] = [];
  const pattern =
    /《([^《》]{1,30})》|「([^「」]{1,30})」|『([^『』]{1,30})』|“([^“”]{1,30})”|‘([^‘’]{1,30})’|"([^"]{1,30})"|'([^']{1,30})'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const raw = match.slice(1).find((item) => item !== undefined) ?? "";
    const term = trimTerm(raw);
    if (isValidTerm(term) && !terms.includes(term)) terms.push(term);
  }
  return terms;
}

function splitPossibleTermList(text: string): string[] {
  const cleaned = text
    .replace(/^(关键词|关键字|必须出现|务必出现|一定要出现|要求出现|包含|写到|提到|保留|出现|不要出现|禁止出现|禁止词|禁用词)\s*[:：]?/u, "")
    .replace(/^(必须|务必|一定要|要求|不要|不得|禁止|不能|避免|别)\s*/u, "")
    .trim();
  if (!cleaned) return [];
  if (!LIST_SEPARATOR_PATTERN.test(cleaned)) {
    const single = trimTerm(cleaned);
    return isValidTerm(single) && single.length <= 20 ? [single] : [];
  }
  return cleaned
    .split(LIST_SEPARATOR_PATTERN)
    .map((item) => trimTerm(item))
    .filter(isValidTerm);
}

function textAfterFirstMatch(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return "";
  return text.slice(match.index + match[0].length).trim();
}

function extractPreciseTerms(clause: string, mode: "required" | "forbidden"): string[] {
  const quoted = extractQuotedTerms(clause);
  if (quoted.length > 0) return quoted;

  const label =
    mode === "required"
      ? clause.match(/(?:关键词|关键字)\s*[:：]\s*(.+)$/u)
      : clause.match(/(?:不要出现|禁止出现|禁止词|禁用词)\s*[:：]\s*(.+)$/u);
  if (label?.[1]) return splitPossibleTermList(label[1]);

  if (mode === "required") {
    const listMatch = clause.match(/(?:必须|务必|一定要|要求)?\s*(?:出现|包含|写到|提到|保留)\s*[:：]?\s*(.+)$/u);
    if (listMatch?.[1]) return splitPossibleTermList(listMatch[1]);
  } else {
    if (BOUNDARY_PATTERN.test(clause)) return [];
    const listMatch = clause.match(/(?:不要出现|禁止出现|禁止|不得|不能|避免|别)\s*[:：]?\s*(.+)$/u);
    if (listMatch?.[1]) return splitPossibleTermList(listMatch[1]);
  }

  const tail = textAfterFirstMatch(clause, mode === "required" ? REQUIRED_PATTERN : FORBIDDEN_PATTERN);
  if (mode === "required" && (/^[让使令把]/u.test(tail) || FORBIDDEN_PATTERN.test(tail))) {
    return [];
  }
  if (/^[:：]/u.test(tail) || LIST_SEPARATOR_PATTERN.test(tail)) {
    return splitPossibleTermList(tail.replace(/^[:：]/u, ""));
  }
  return [];
}

function extractInto(set: PromptConstraintSet, text: string): void {
  for (const clause of splitIntoClauses(text)) {
    const isForbidden = FORBIDDEN_PATTERN.test(clause);
    const isRequired = REQUIRED_PATTERN.test(clause) && !isForbidden;
    const isStyle = STYLE_PATTERN.test(clause);
    const isBoundary = BOUNDARY_PATTERN.test(clause);

    if (isRequired || isForbidden) {
      pushUnique(set.rawHardRules, clause, MAX_RAW_HARD_RULES);
    }
    if (isStyle) {
      pushUnique(set.styleDirectives, clause, MAX_STYLE_DIRECTIVES);
    }
    if (isBoundary) {
      pushUnique(set.plotBoundaries, clause, MAX_PLOT_BOUNDARIES);
    }
    if (isRequired) {
      for (const term of extractPreciseTerms(clause, "required")) {
        pushTerm(set.requiredTerms, term, MAX_REQUIRED_TERMS);
      }
    }
    if (isForbidden) {
      for (const term of extractPreciseTerms(clause, "forbidden")) {
        pushTerm(set.forbiddenTerms, term, MAX_FORBIDDEN_TERMS);
      }
    }
  }
}

export function extractPromptConstraints(text: string | string[]): PromptConstraintSet {
  const set = emptyConstraintSet();
  const parts = Array.isArray(text) ? text : [text];
  for (const part of parts) {
    if (part && part.trim()) extractInto(set, part);
  }
  return set;
}

export function mergePromptConstraints(
  base: PromptConstraintSet,
  next: PromptConstraintSet,
): PromptConstraintSet {
  const merged = emptyConstraintSet();
  for (const term of [...base.requiredTerms, ...next.requiredTerms]) {
    pushTerm(merged.requiredTerms, term, MAX_REQUIRED_TERMS);
  }
  for (const term of [...base.forbiddenTerms, ...next.forbiddenTerms]) {
    pushTerm(merged.forbiddenTerms, term, MAX_FORBIDDEN_TERMS);
  }
  for (const item of [...base.styleDirectives, ...next.styleDirectives]) {
    pushUnique(merged.styleDirectives, item, MAX_STYLE_DIRECTIVES);
  }
  for (const item of [...base.plotBoundaries, ...next.plotBoundaries]) {
    pushUnique(merged.plotBoundaries, item, MAX_PLOT_BOUNDARIES);
  }
  for (const item of [...base.rawHardRules, ...next.rawHardRules]) {
    pushUnique(merged.rawHardRules, item, MAX_RAW_HARD_RULES);
  }
  return merged;
}

export function hasPromptConstraints(set: PromptConstraintSet | undefined): boolean {
  if (!set) return false;
  return (
    set.requiredTerms.length > 0 ||
    set.forbiddenTerms.length > 0 ||
    set.styleDirectives.length > 0 ||
    set.plotBoundaries.length > 0 ||
    set.rawHardRules.length > 0
  );
}

export function getRequiredTermsForText(
  text: string,
  requiredTerms: readonly string[],
): string[] {
  return requiredTerms.filter((term) => text.includes(term));
}

export function renderPromptConstraintBlock(
  constraints: PromptConstraintSet | undefined,
  options: { currentText?: string; heading?: string } = {},
): string {
  if (!hasPromptConstraints(constraints)) return "";

  const currentRequiredTerms = options.currentText
    ? getRequiredTermsForText(options.currentText, constraints?.requiredTerms ?? [])
    : [];
  const lines: string[] = [options.heading ?? "# 写作约束清单"];

  if (currentRequiredTerms.length > 0) {
    lines.push(
      `- 本段必须直接落到正文的词条：${currentRequiredTerms.map((term) => `「${term}」`).join("、")}`,
    );
  }
  if (constraints?.requiredTerms.length) {
    lines.push(
      `- 全局必写词条：${constraints.requiredTerms.map((term) => `「${term}」`).join("、")}`,
    );
  }
  if (constraints?.forbiddenTerms.length) {
    lines.push(
      `- 全局禁止词条：${constraints.forbiddenTerms.map((term) => `「${term}」`).join("、")}`,
    );
  }
  if (constraints?.styleDirectives.length) {
    lines.push("- 风格/语气/节奏要求：");
    for (const item of constraints.styleDirectives) lines.push(`  - ${item}`);
  }
  if (constraints?.plotBoundaries.length) {
    lines.push("- 剧情边界：");
    for (const item of constraints.plotBoundaries) lines.push(`  - ${item}`);
  }
  if (constraints?.rawHardRules.length) {
    lines.push("- 原始硬性规则：");
    for (const item of constraints.rawHardRules) lines.push(`  - ${item}`);
  }

  lines.push("执行规则：必写词条必须原样出现；禁止词条不得出现在正文；长句规则按语义执行，不做近义替换。");
  return lines.join("\n");
}

function excerptAround(text: string, term: string): string {
  const index = text.indexOf(term);
  if (index < 0) return "";
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + term.length + 40);
  return text.slice(start, end);
}

export function evaluateSegmentConstraints(
  input: EvaluateSegmentConstraintsInput,
): OocFinding[] {
  const findings: OocFinding[] = [];
  const requiredTerms = input.requiredTerms ?? input.promptConstraints.requiredTerms;
  for (const term of requiredTerms) {
    if (!input.segmentText.includes(term)) {
      findings.push({
        severity: "error",
        excerpt: "",
        suggestion: `本段必须原样写入词条「${term}」，不能省略或用近义词替代。`,
        score: 4,
      });
    }
  }
  for (const term of input.promptConstraints.forbiddenTerms) {
    if (input.segmentText.includes(term)) {
      findings.push({
        severity: "error",
        excerpt: excerptAround(input.segmentText, term),
        suggestion: `正文出现了禁止词条「${term}」，请删除该词或改写相关句子。`,
        score: 4,
      });
    }
  }
  return findings;
}
