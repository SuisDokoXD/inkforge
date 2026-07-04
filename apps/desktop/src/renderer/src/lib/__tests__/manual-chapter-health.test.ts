import { describe, expect, it } from "vitest";
import {
  MANUAL_HEALTH_LONG_PARAGRAPH_GRAPHEMES,
  buildManualChapterHealthReport,
} from "../manual-chapter-health";

describe("manual chapter health helpers", () => {
  it("summarizes local chapter structure", () => {
    const report = buildManualChapterHealthReport(
      "chapter-1",
      "# 第一章\n\n第一段正文。\n\n---\n\n第二段【待补：动机】",
    );

    expect(report).toMatchObject({
      paragraphs: 2,
      headings: 1,
      sceneBreaks: 1,
      scenes: 2,
      todos: 1,
    });
    expect(report.issues.map((issue) => issue.kind)).toEqual(["todo"]);
  });

  it("reports long paragraphs with jump text", () => {
    const longParagraph = "长".repeat(MANUAL_HEALTH_LONG_PARAGRAPH_GRAPHEMES);
    const report = buildManualChapterHealthReport("chapter-1", `短段。\n\n${longParagraph}`);

    expect(report.longParagraphs).toEqual([
      expect.objectContaining({
        line: 3,
        graphemes: MANUAL_HEALTH_LONG_PARAGRAPH_GRAPHEMES,
      }),
    ]);
    expect(report.longParagraphs[0]?.jumpText.length).toBeLessThanOrEqual(60);
    expect(report.issues.some((issue) => issue.kind === "long-paragraph" && issue.line === 3)).toBe(true);
  });

  it("reports long scenes and scene-break suggestions", () => {
    const longScene = "场".repeat(2600);
    const report = buildManualChapterHealthReport("chapter-1", longScene);

    expect(report.sceneBreaks).toBe(0);
    expect(report.longScenes).toEqual([
      expect.objectContaining({
        index: 1,
        line: 1,
        graphemes: 2600,
      }),
    ]);
    expect(report.issues.map((issue) => issue.kind)).toContain("long-scene");
    expect(report.issues.map((issue) => issue.kind)).toContain("scene-suggestion");
  });

  it("does not count headings or scene breaks as paragraphs", () => {
    const report = buildManualChapterHealthReport("chapter-1", "# 标题\n\n---\n\n正文");

    expect(report.paragraphs).toBe(1);
    expect(report.maxParagraphGraphemes).toBe(2);
    expect(report.averageParagraphGraphemes).toBe(2);
  });
});
