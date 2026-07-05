import type { ManualChapterHealthIssue, ManualChapterHealthReport } from "./manual-chapter-health";
import type { ManualParagraphFocusOverview } from "./manual-paragraph-focus";
import { normalizeNextBeat, normalizeRhythmSnippet } from "./manual-writing-rhythm";

export type ManualSubmissionCheckStatus = "ready" | "needs-work";
export type ManualSubmissionCheckIssueKind =
  | "todo"
  | "long-paragraph"
  | "long-scene"
  | "scene-suggestion"
  | "current-paragraph-todo"
  | "current-paragraph-long";

export interface ManualSubmissionCheckIssue {
  id: string;
  kind: ManualSubmissionCheckIssueKind;
  title: string;
  detail: string;
  line: number;
  beatText: string;
  jumpText?: string;
  healthIssue?: ManualChapterHealthIssue;
}

export interface ManualSubmissionCheckReport {
  status: ManualSubmissionCheckStatus;
  issueCount: number;
  issues: ManualSubmissionCheckIssue[];
  primaryIssue: ManualSubmissionCheckIssue | null;
}

export function manualSubmissionCheckStorageKey(projectId: string, chapterId: string): string {
  return `inkforge:manual-submission-check:${projectId}:${chapterId}`;
}

function beatTextForHealthIssue(issue: ManualChapterHealthIssue): string {
  if (issue.kind === "todo") return "清理本章待补";
  if (issue.kind === "long-paragraph") return `拆分长段落：第 ${issue.line} 行`;
  if (issue.kind === "long-scene") return `收束长场景：第 ${issue.line} 行`;
  return "补上场景分隔";
}

function titleForHealthIssue(issue: ManualChapterHealthIssue): string {
  if (issue.kind === "todo") return "待补未清";
  if (issue.kind === "long-paragraph") return "段落偏长";
  if (issue.kind === "long-scene") return "场景偏长";
  return "缺少场景分隔";
}

function issueFromHealth(issue: ManualChapterHealthIssue): ManualSubmissionCheckIssue {
  return {
    id: `health:${issue.id}`,
    kind: issue.kind,
    title: titleForHealthIssue(issue),
    detail: issue.detail,
    line: issue.line,
    beatText: normalizeNextBeat(beatTextForHealthIssue(issue)),
    jumpText: issue.jumpText,
    healthIssue: issue,
  };
}

export function buildManualSubmissionCheckReport(
  health: ManualChapterHealthReport,
  paragraphFocus: ManualParagraphFocusOverview,
): ManualSubmissionCheckReport {
  const issues: ManualSubmissionCheckIssue[] = health.issues.map(issueFromHealth);
  const currentParagraph = paragraphFocus.current;

  if (currentParagraph?.hasTodo) {
    issues.push({
      id: `paragraph-todo:${currentParagraph.startLine}`,
      kind: "current-paragraph-todo",
      title: "当前段有待补",
      detail: `第 ${currentParagraph.startLine} 行起，本段还有待补。`,
      line: currentParagraph.startLine,
      beatText: normalizeNextBeat(`补上当前段待补：${currentParagraph.preview}`),
      jumpText: currentParagraph.jumpText,
    });
  }

  if (currentParagraph?.isLong) {
    issues.push({
      id: `paragraph-long:${currentParagraph.startLine}`,
      kind: "current-paragraph-long",
      title: "当前段偏长",
      detail: `第 ${currentParagraph.startLine} 行起约 ${currentParagraph.graphemes} 字。`,
      line: currentParagraph.startLine,
      beatText: normalizeNextBeat(`收束当前段：${currentParagraph.preview}`),
      jumpText: currentParagraph.jumpText,
    });
  }

  const normalizedIssues = issues.map((issue) => ({
    ...issue,
    detail: normalizeRhythmSnippet(issue.detail, 120),
  }));

  return {
    status: normalizedIssues.length === 0 ? "ready" : "needs-work",
    issueCount: normalizedIssues.length,
    issues: normalizedIssues,
    primaryIssue: normalizedIssues[0] ?? null,
  };
}