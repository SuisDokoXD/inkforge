import { describe, expect, it } from "vitest";
import type { ReviewFindingRecord } from "@inkforge/shared";
import {
  computeReportSummary,
  findExcerptRange,
  parseFindingsFromLlm,
} from "../index";

function finding(
  id: string,
  severity: ReviewFindingRecord["severity"],
  dimensionId: string,
  chapterId: string | null,
): ReviewFindingRecord {
  return {
    id,
    reportId: "report-1",
    dimensionId,
    chapterId,
    excerpt: "excerpt",
    excerptStart: null,
    excerptEnd: null,
    severity,
    suggestion: "suggestion",
    dismissed: false,
    createdAt: "2026-06-12T00:00:00.000Z",
  };
}

describe("parseFindingsFromLlm", () => {
  it("extracts the first JSON array and normalizes valid drafts", () => {
    const result = parseFindingsFromLlm(
      [
        "prefix",
        JSON.stringify([
          { severity: "error", excerpt: "  hard conflict  ", suggestion: "  rewrite it  " },
          { severity: "unknown", excerpt: "", suggestion: "fallback severity" },
          { severity: "warn" },
          "bad",
        ]),
        "suffix",
      ].join("\n"),
      "warn",
    );

    expect(result).toEqual([
      { severity: "error", excerpt: "hard conflict", suggestion: "rewrite it" },
      { severity: "warn", excerpt: "", suggestion: "fallback severity" },
    ]);
  });

  it("returns an empty list for malformed or missing arrays", () => {
    expect(parseFindingsFromLlm("no json here", "info")).toEqual([]);
    expect(parseFindingsFromLlm("[not json]", "info")).toEqual([]);
  });
});

describe("computeReportSummary", () => {
  it("counts totals, dimensions, and chapters", () => {
    const summary = computeReportSummary([
      finding("f1", "info", "style", "chapter-1"),
      finding("f2", "warn", "style", "chapter-1"),
      finding("f3", "error", "timeline", "chapter-2"),
      finding("f4", "warn", "timeline", null),
    ]);

    expect(summary.totals).toEqual({ info: 1, warn: 2, error: 1 });
    expect(summary.perDimension).toEqual([
      { dimensionId: "style", count: 2 },
      { dimensionId: "timeline", count: 2 },
    ]);
    expect(summary.perChapter).toEqual([
      { chapterId: "chapter-1", count: 2 },
      { chapterId: "chapter-2", count: 1 },
    ]);
  });
});

describe("findExcerptRange", () => {
  it("returns the start and end offsets for trimmed excerpts", () => {
    expect(findExcerptRange("alpha beta gamma", " beta ")).toEqual({ start: 6, end: 10 });
  });

  it("returns null for empty or missing excerpts", () => {
    expect(findExcerptRange("alpha", "")).toBeNull();
    expect(findExcerptRange("alpha", "omega")).toBeNull();
  });
});
