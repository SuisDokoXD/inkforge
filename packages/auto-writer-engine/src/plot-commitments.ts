import type { AutoWriterCorrectionEntry } from "@inkforge/shared";
import type { PlotCommitment } from "./types";

const MAX_COMMITMENTS = 16;
const MAX_TEXT_LENGTH = 180;
const MAX_TERM_LENGTH = 30;

const FORESHADOW_PATTERN = /伏笔|铺垫|埋线|线索|暗示|预示/;
const PAYOFF_PATTERN = /回收|呼应|兑现|揭开伏笔|收束/;
const REVEAL_PATTERN = /揭示|揭露| reveal |真相|摊牌|公开|暴露/iu;
const AVOID_REVEAL_PATTERN = /不要揭示|不能揭示|不得揭示|避免揭示|不要暴露|不能暴露|不得暴露|不要提前|不能提前|不得提前|避免提前|暂不揭示|先不揭示/;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoClauses(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/[\n。.!！?？；;]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function trimTerm(text: string): string {
  return normalizeText(text)
    .replace(/^[\s:："'“”‘’「」『』《》【】\[\]（）()]+/, "")
    .replace(/[\s:："'“”‘’「」『』《》【】\[\]（）()。.!！?？]+$/, "")
    .trim();
}

function isValidTerm(term: string): boolean {
  if (!term || term.length > MAX_TERM_LENGTH) return false;
  if (/[\n\r。.!！?？；;]/.test(term)) return false;
  return true;
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

function commitmentKind(text: string): PlotCommitment["kind"] | null {
  if (AVOID_REVEAL_PATTERN.test(text)) return "avoid-reveal";
  if (PAYOFF_PATTERN.test(text)) return "payoff";
  if (REVEAL_PATTERN.test(text)) return "reveal";
  if (FORESHADOW_PATTERN.test(text)) return "foreshadow";
  return null;
}

function pushCommitment(
  target: PlotCommitment[],
  commitment: PlotCommitment,
): void {
  const text = commitment.text.slice(0, MAX_TEXT_LENGTH).trim();
  if (!text || target.length >= MAX_COMMITMENTS) return;
  const exists = target.some(
    (item) => item.kind === commitment.kind && item.text === text,
  );
  if (exists) return;
  target.push({
    ...commitment,
    text,
  });
}

export function extractPlotCommitmentsFromText(
  text: string,
  source: PlotCommitment["source"],
): PlotCommitment[] {
  const commitments: PlotCommitment[] = [];
  for (const clause of splitIntoClauses(text)) {
    const kind = commitmentKind(clause);
    if (!kind) continue;
    pushCommitment(commitments, {
      kind,
      text: clause,
      exactTerms: extractQuotedTerms(clause),
      source,
    });
  }
  return commitments;
}

export function extractPlotCommitments(input: {
  userIdeas: string;
  corrections?: AutoWriterCorrectionEntry[];
  outlineTexts?: string[];
}): PlotCommitment[] {
  const commitments: PlotCommitment[] = [];
  for (const item of extractPlotCommitmentsFromText(input.userIdeas, "userIdeas")) {
    pushCommitment(commitments, item);
  }
  for (const correction of input.corrections ?? []) {
    for (const item of extractPlotCommitmentsFromText(correction.content, "correction")) {
      pushCommitment(commitments, item);
    }
  }
  for (const outline of input.outlineTexts ?? []) {
    for (const item of extractPlotCommitmentsFromText(outline, "outline")) {
      pushCommitment(commitments, item);
    }
  }
  return commitments;
}

export function mergePlotCommitments(
  base: PlotCommitment[],
  next: PlotCommitment[],
): PlotCommitment[] {
  const merged: PlotCommitment[] = [];
  for (const item of [...base, ...next]) pushCommitment(merged, item);
  return merged;
}

export function renderPlotCommitmentsBlock(
  commitments: readonly PlotCommitment[] | undefined,
  heading = "# 剧情承诺/伏笔清单",
): string {
  if (!commitments || commitments.length === 0) return "";
  const lines = [heading];
  for (const item of commitments) {
    const terms = item.exactTerms.length > 0
      ? `；精确词：${item.exactTerms.map((term) => `「${term}」`).join("、")}`
      : "";
    lines.push(`- ${item.kind}｜${item.source}：${item.text}${terms}`);
  }
  lines.push("执行规则：承诺项按语义检查；只有精确词明确列出时才按原样词条检查。");
  return lines.join("\n");
}
