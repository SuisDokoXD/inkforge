import { describe, expect, it } from "vitest";
import { parseBookDiagnosis } from "../book-diagnosis";

describe("book-diagnosis", () => {
  it("parses a structured book diagnosis", () => {
    const result = parseBookDiagnosis(`\`\`\`json
{
  "status": "fail",
  "summary": "中段时间线和人物动机冲突。",
  "findings": [
    {
      "severity": "error",
      "category": "timeline",
      "scope": "第 3-4 章",
      "evidence": "同一天发生了互斥事件。",
      "recommendation": "调整其中一章的日期。"
    }
  ],
  "revisionTasks": [
    {
      "priority": "P0",
      "chapterHint": "第 4 章",
      "action": "改写事件发生日期。",
      "reason": "避免时间线冲突。"
    }
  ]
}
\`\`\``);

    expect(result).toEqual({
      status: "fail",
      summary: "中段时间线和人物动机冲突。",
      findings: [
        {
          severity: "error",
          category: "timeline",
          scope: "第 3-4 章",
          evidence: "同一天发生了互斥事件。",
          recommendation: "调整其中一章的日期。",
        },
      ],
      revisionTasks: [
        {
          priority: "P0",
          chapterHint: "第 4 章",
          action: "改写事件发生日期。",
          reason: "避免时间线冲突。",
        },
      ],
    });
  });

  it("normalizes unknown fields and infers review status", () => {
    const result = parseBookDiagnosis(JSON.stringify({
      summary: "",
      findings: [
        {
          severity: "unknown",
          category: "unknown",
          evidence: "章间衔接略跳。",
          suggestion: "补一段过渡。",
        },
      ],
      revisionTasks: [
        {
          priority: "bad",
          chapter: "第 2 章",
          action: "补过渡。",
        },
      ],
    }));

    expect(result.status).toBe("review");
    expect(result.summary).toBe("全书诊断没有给出摘要。");
    expect(result.findings[0]).toMatchObject({
      severity: "warn",
      category: "continuity",
      scope: "全书",
      recommendation: "补一段过渡。",
    });
    expect(result.revisionTasks[0]).toMatchObject({
      priority: "P2",
      chapterHint: "第 2 章",
      reason: "补过渡。",
    });
  });

  it("falls back for non-json text", () => {
    const result = parseBookDiagnosis("自然语言诊断");

    expect(result.status).toBe("review");
    expect(result.summary).toContain("无法解析");
    expect(result.findings).toEqual([]);
    expect(result.revisionTasks).toEqual([]);
  });
});
