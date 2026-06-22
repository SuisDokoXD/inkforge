import { describe, expect, it } from "vitest";
import { renderAutoWriterRunReportMarkdown } from "../auto-writer-report";
import type { AutoWriterRunReport } from "../types";

describe("auto-writer-report", () => {
  it("renders a Chinese markdown run report without implementation terms", () => {
    const report: AutoWriterRunReport = {
      constraints: {
        requiredTerms: [{ term: "青灯", matched: true, segmentIndexes: [0] }],
        forbiddenTerms: [{ term: "旧王", matched: false, segmentIndexes: [] }],
        styleDirectives: ["文风保持冷静克制"],
        plotBoundaries: ["不能让女主提前知道真相"],
      },
      plotCommitments: [
        {
          kind: "foreshadow",
          text: "埋下「青灯」伏笔",
          exactTerms: ["青灯"],
          source: "userIdeas",
        },
      ],
      segments: [
        {
          index: 0,
          beat: "open",
          rewriteCount: 1,
          acceptedFindingCount: 0,
          requiredTerms: ["青灯"],
        },
      ],
      chapterQuality: {
        status: "fail",
        findings: [
          {
            severity: "error",
            category: "constraint",
            excerpt: "旧王",
            suggestion: "正文出现禁止词。",
          },
        ],
      },
      writingConflict: {
        status: "completed",
        analysis: {
          reconcilable: true,
          summary: "生成稿没有执行禁止词约束。",
          rootCause: "constraint-history",
          extraConstraints: "下一次必须避开旧王。",
          suggestedActions: [
            {
              id: "retry",
              label: "重新生成",
              description: "带着补充约束重新生成。",
            },
          ],
        },
      },
    };

    const markdown = renderAutoWriterRunReportMarkdown(report);

    expect(markdown).toContain("# 本次写作报告");
    expect(markdown).toContain("必写「青灯」：已满足");
    expect(markdown).toContain("禁止「旧王」：未出现");
    expect(markdown).toContain("剧情承诺");
    expect(markdown).toContain("第 1 段：重写 1 次");
    expect(markdown).toContain("章节复核");
    expect(markdown).toContain("冲突分析");
    expect(markdown).toContain("重新生成：带着补充约束重新生成。");
    expect(markdown).not.toContain("provider");
    expect(markdown).not.toContain("token");
    expect(markdown).not.toContain("payload");
  });

  it("renders empty sections defensively", () => {
    const markdown = renderAutoWriterRunReportMarkdown({
      constraints: {
        requiredTerms: [],
        forbiddenTerms: [],
        styleDirectives: [],
        plotBoundaries: [],
      },
      plotCommitments: [],
      segments: [],
    });

    expect(markdown).toContain("没有识别到需要逐词检查");
    expect(markdown).toContain("没有完成的段落");
  });
});
