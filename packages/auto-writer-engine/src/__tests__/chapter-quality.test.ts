import { describe, expect, it } from "vitest";
import {
  chapterQualityFindingsToMarkdown,
  parseChapterFactCheck,
  summarizeChapterQuality,
} from "../chapter-quality";

describe("chapter-quality", () => {
  it("parses a passing JSON result", () => {
    const result = parseChapterFactCheck('{"result":"PASS","issues":[]}');

    expect(result.result).toBe("PASS");
    expect(result.issues).toEqual([]);
  });

  it("parses structured issues from a fenced JSON block", () => {
    const result = parseChapterFactCheck(`\`\`\`json
{
  "result": "FAIL",
  "issues": [
    {
      "severity": "error",
      "category": "constraint",
      "excerpt": "missing term",
      "suggestion": "补上必写词"
    },
    {
      "severity": "warn",
      "category": "timeline",
      "suggestion": "时间衔接需要复核"
    }
  ]
}
\`\`\``);

    expect(result.result).toBe("FAIL");
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      category: "constraint",
      excerpt: "missing term",
      suggestion: "补上必写词",
    });
  });

  it("accepts string issues as warning findings", () => {
    const result = parseChapterFactCheck('{"result":"FAIL","issues":["人物称呼前后不一致"]}');

    expect(result.result).toBe("FAIL");
    expect(result.issues).toEqual([
      {
        severity: "warn",
        category: "fact",
        excerpt: "",
        suggestion: "人物称呼前后不一致",
      },
    ]);
  });

  it("returns a warning finding for non-json text instead of throwing", () => {
    const result = parseChapterFactCheck("模型返回了一段自然语言说明");

    expect(result.result).toBe("FAIL");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe("warn");
    expect(result.issues[0]?.suggestion).toContain("无法解析");
  });

  it("summarizes findings and renders markdown", () => {
    const findings = [
      {
        severity: "error" as const,
        category: "constraint" as const,
        excerpt: "旧王",
        suggestion: "删除禁止词",
      },
      {
        severity: "warn" as const,
        category: "timeline" as const,
        excerpt: "",
        suggestion: "复核时间线",
      },
      {
        severity: "info" as const,
        category: "style" as const,
        excerpt: "",
        suggestion: "文风较平",
      },
    ];

    expect(summarizeChapterQuality(findings)).toEqual({
      errorCount: 1,
      warnCount: 1,
      infoCount: 1,
    });
    expect(chapterQualityFindingsToMarkdown(findings)).toContain("error/constraint");
    expect(chapterQualityFindingsToMarkdown([])).toBe("未发现需要复核的问题。");
  });
});
