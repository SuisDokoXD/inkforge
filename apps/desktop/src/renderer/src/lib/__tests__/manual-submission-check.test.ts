import { describe, expect, it } from "vitest";
import { buildManualChapterHealthReport } from "../manual-chapter-health";
import { buildManualParagraphFocusOverview } from "../manual-paragraph-focus";
import { buildManualSubmissionCheckReport, manualSubmissionCheckStorageKey } from "../manual-submission-check";

describe("manual submission check", () => {
  it("reports ready when chapter and current paragraph are clean", () => {
    const content = "# 开始\n短段落\n\n---\n下一段";
    const report = buildManualSubmissionCheckReport(
      buildManualChapterHealthReport("chapter-1", content),
      buildManualParagraphFocusOverview(content, 2),
    );

    expect(report.status).toBe("ready");
    expect(report.issueCount).toBe(0);
    expect(report.primaryIssue).toBeNull();
  });

  it("surfaces chapter health issues as submission issues", () => {
    const content = "# 开始\n【待补：补动机】";
    const report = buildManualSubmissionCheckReport(
      buildManualChapterHealthReport("chapter-1", content),
      buildManualParagraphFocusOverview(content, 2),
    );

    expect(report.status).toBe("needs-work");
    expect(report.issues.map((item) => item.title)).toContain("待补未清");
    expect(report.primaryIssue?.beatText).toBe("清理本章待补");
  });

  it("adds current paragraph todo and long paragraph issues", () => {
    const content = `【待补：补情绪】${"字".repeat(650)}`;
    const report = buildManualSubmissionCheckReport(
      buildManualChapterHealthReport("chapter-1", content),
      buildManualParagraphFocusOverview(content, 1),
    );

    expect(report.issues.some((item) => item.kind === "current-paragraph-todo")).toBe(true);
    expect(report.issues.some((item) => item.kind === "current-paragraph-long")).toBe(true);
    expect(report.issues.find((item) => item.kind === "current-paragraph-long")?.beatText.startsWith("收束当前段：")).toBe(true);
  });

  it("creates a per chapter local storage key", () => {
    expect(manualSubmissionCheckStorageKey("project-1", "chapter-1")).toBe(
      "inkforge:manual-submission-check:project-1:chapter-1",
    );
  });
});