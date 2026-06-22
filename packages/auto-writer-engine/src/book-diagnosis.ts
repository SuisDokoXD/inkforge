import type {
  BookDiagnosisFinding,
  BookDiagnosisResult,
  BookRevisionTask,
} from "./types";

const FINDING_SEVERITIES = new Set(["info", "warn", "error"]);
const FINDING_CATEGORIES = new Set([
  "structure",
  "pacing",
  "character",
  "world",
  "timeline",
  "foreshadow",
  "style",
  "continuity",
]);
const TASK_PRIORITIES = new Set(["P0", "P1", "P2"]);

function stripJsonFence(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function normalizeSeverity(value: unknown): BookDiagnosisFinding["severity"] {
  const text = String(value ?? "").toLowerCase();
  return FINDING_SEVERITIES.has(text)
    ? (text as BookDiagnosisFinding["severity"])
    : "warn";
}

function normalizeCategory(value: unknown): BookDiagnosisFinding["category"] {
  const text = String(value ?? "").toLowerCase();
  return FINDING_CATEGORIES.has(text)
    ? (text as BookDiagnosisFinding["category"])
    : "continuity";
}

function normalizeStatus(value: unknown, findings: BookDiagnosisFinding[]): BookDiagnosisResult["status"] {
  const text = String(value ?? "").toLowerCase();
  if (text === "pass" || text === "review" || text === "fail") return text;
  if (findings.some((finding) => finding.severity === "error")) return "fail";
  if (findings.length > 0) return "review";
  return "pass";
}

function normalizeFinding(value: unknown): BookDiagnosisFinding | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const evidence = String(item.evidence ?? item.excerpt ?? "").trim();
  const recommendation = String(item.recommendation ?? item.suggestion ?? "").trim();
  if (!evidence && !recommendation) return null;
  return {
    severity: normalizeSeverity(item.severity),
    category: normalizeCategory(item.category),
    scope: String(item.scope ?? "").trim() || "全书",
    evidence,
    recommendation: recommendation || evidence,
  };
}

function normalizeTask(value: unknown): BookRevisionTask | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const action = String(item.action ?? "").trim();
  const reason = String(item.reason ?? "").trim();
  if (!action && !reason) return null;
  const priority = String(item.priority ?? "P2").toUpperCase();
  return {
    priority: TASK_PRIORITIES.has(priority) ? (priority as BookRevisionTask["priority"]) : "P2",
    chapterHint: String(item.chapterHint ?? item.chapter ?? "").trim() || "全书",
    action: action || reason,
    reason: reason || action,
  };
}

export function parseBookDiagnosis(raw: string): BookDiagnosisResult {
  const rawText = raw ?? "";
  const text = stripJsonFence(rawText);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("book diagnosis result is not an object");
    }
    const obj = parsed as Record<string, unknown>;
    const findings = Array.isArray(obj.findings)
      ? obj.findings
          .map((item) => normalizeFinding(item))
          .filter((item): item is BookDiagnosisFinding => item !== null)
      : [];
    const revisionTasks = Array.isArray(obj.revisionTasks)
      ? obj.revisionTasks
          .map((item) => normalizeTask(item))
          .filter((item): item is BookRevisionTask => item !== null)
      : [];
    return {
      status: normalizeStatus(obj.status, findings),
      summary: String(obj.summary ?? "").trim() || "全书诊断没有给出摘要。",
      findings,
      revisionTasks,
    };
  } catch {
    const fallback = rawText.trim();
    return {
      status: "review",
      summary: fallback
        ? `全书诊断返回内容无法解析，需要人工复核：${fallback.slice(0, 200)}`
        : "全书诊断没有返回内容，需要人工复核。",
      findings: [],
      revisionTasks: [],
    };
  }
}
