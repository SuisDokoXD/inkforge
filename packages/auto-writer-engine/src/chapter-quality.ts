import type { ChapterFactCheckResult, ChapterQualityFinding } from "./types";

const VALID_SEVERITIES = new Set(["info", "warn", "error"]);
const VALID_CATEGORIES = new Set([
  "fact",
  "timeline",
  "character",
  "world",
  "constraint",
  "plot-boundary",
  "foreshadow",
  "style",
]);

function stripJsonFence(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const startObject = text.indexOf("{");
  const endObject = text.lastIndexOf("}");
  if (startObject >= 0 && endObject > startObject) {
    return text.slice(startObject, endObject + 1);
  }
  return text;
}

function normalizeSeverity(value: unknown): ChapterQualityFinding["severity"] {
  const text = String(value ?? "").toLowerCase();
  return VALID_SEVERITIES.has(text)
    ? (text as ChapterQualityFinding["severity"])
    : "warn";
}

function normalizeCategory(value: unknown): ChapterQualityFinding["category"] {
  const text = String(value ?? "").toLowerCase();
  return VALID_CATEGORIES.has(text)
    ? (text as ChapterQualityFinding["category"])
    : "fact";
}

function normalizeFinding(value: unknown): ChapterQualityFinding | null {
  if (typeof value === "string") {
    const suggestion = value.trim();
    if (!suggestion) return null;
    return {
      severity: "warn",
      category: "fact",
      excerpt: "",
      suggestion,
    };
  }
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const suggestion = String(item.suggestion ?? item.message ?? item.issue ?? "").trim();
  const excerpt = String(item.excerpt ?? item.evidence ?? "").trim();
  if (!suggestion && !excerpt) return null;
  return {
    severity: normalizeSeverity(item.severity),
    category: normalizeCategory(item.category),
    excerpt,
    suggestion: suggestion || excerpt,
  };
}

function parseResult(value: unknown, issues: ChapterQualityFinding[]): "PASS" | "FAIL" {
  const text = String(value ?? "").toUpperCase();
  if (text === "PASS") return "PASS";
  if (text === "FAIL") return "FAIL";
  return issues.some((item) => item.severity === "error") ? "FAIL" : "PASS";
}

export function parseChapterFactCheck(raw: string): ChapterFactCheckResult {
  const rawText = raw ?? "";
  const text = stripJsonFence(rawText);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("chapter fact check result is not an object");
    }
    const obj = parsed as Record<string, unknown>;
    const rawIssues = Array.isArray(obj.issues)
      ? obj.issues
      : Array.isArray(obj.findings)
        ? obj.findings
        : [];
    const issues = rawIssues
      .map((item) => normalizeFinding(item))
      .filter((item): item is ChapterQualityFinding => item !== null);
    return {
      result: parseResult(obj.result ?? obj.status, issues),
      issues,
      rawText: rawText.trim() ? rawText : undefined,
    };
  } catch {
    const fallback = rawText.trim();
    return {
      result: "FAIL",
      issues: fallback
        ? [
            {
              severity: "warn",
              category: "fact",
              excerpt: "",
              suggestion: `章节检查返回内容无法解析，需要人工复核：${fallback.slice(0, 200)}`,
            },
          ]
        : [],
      rawText: fallback || undefined,
    };
  }
}

export function summarizeChapterQuality(findings: ChapterQualityFinding[]): {
  errorCount: number;
  warnCount: number;
  infoCount: number;
} {
  return findings.reduce(
    (summary, finding) => {
      if (finding.severity === "error") summary.errorCount += 1;
      else if (finding.severity === "warn") summary.warnCount += 1;
      else summary.infoCount += 1;
      return summary;
    },
    { errorCount: 0, warnCount: 0, infoCount: 0 },
  );
}

export function chapterQualityFindingsToMarkdown(
  findings: ChapterQualityFinding[],
): string {
  if (findings.length === 0) return "未发现需要复核的问题。";
  return findings
    .map((finding) => {
      const excerpt = finding.excerpt ? `\n  - 相关片段：${finding.excerpt}` : "";
      return `- ${finding.severity}/${finding.category}: ${finding.suggestion}${excerpt}`;
    })
    .join("\n");
}
