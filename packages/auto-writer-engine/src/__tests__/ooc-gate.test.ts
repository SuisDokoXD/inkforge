import { describe, expect, it } from "vitest";
import {
  parseFindings,
  shouldRewriteFromFindings,
  summarizeFindings,
} from "../ooc-gate";

describe("parseFindings", () => {
  it("accepts a fenced JSON object and normalizes fields", () => {
    const longExcerpt = "x".repeat(500);
    const findings = parseFindings(`
\`\`\`json
{
  "severity": "warning",
  "excerpt": "${longExcerpt}",
  "suggestion": "keep the character motivation stable",
  "score": 10.7
}
\`\`\`
`);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warn",
      suggestion: "keep the character motivation stable",
      score: 10,
    });
    expect(findings[0].excerpt.length).toBeLessThanOrEqual(200);
  });

  it("extracts the first array from surrounding model chatter", () => {
    const findings = parseFindings(`
Some prose before the payload.
[
  { "severity": "info", "excerpt": "ok", "suggestion": "minor polish", "score": 8.2 },
  { "severity": "error", "excerpt": "bad", "suggestion": "rewrite this beat" }
]
Trailing prose.
`);

    expect(findings).toEqual([
      { severity: "info", excerpt: "ok", suggestion: "minor polish", score: 8 },
      { severity: "error", excerpt: "bad", suggestion: "rewrite this beat" },
    ]);
  });

  it("returns an empty list for invalid or irrelevant output", () => {
    expect(parseFindings("not json")).toEqual([]);
    expect(parseFindings('"plain string"')).toEqual([]);
  });
});

describe("OOC rewrite decisions", () => {
  it("rewrites on error, too many warnings, or score below threshold", () => {
    expect(
      shouldRewriteFromFindings([
        { severity: "error", excerpt: "a", suggestion: "b" },
      ]),
    ).toBe(true);

    expect(
      shouldRewriteFromFindings(
        [
          { severity: "warn", excerpt: "a", suggestion: "b" },
          { severity: "warn", excerpt: "c", suggestion: "d" },
        ],
        { warnThreshold: 2 },
      ),
    ).toBe(true);

    expect(
      shouldRewriteFromFindings(
        [{ severity: "info", excerpt: "a", suggestion: "b", score: 5 }],
        { minScore: 6 },
      ),
    ).toBe(true);
  });

  it("summarizes severities for UI progress events", () => {
    expect(
      summarizeFindings([
        { severity: "error", excerpt: "a", suggestion: "b" },
        { severity: "warn", excerpt: "c", suggestion: "d" },
        { severity: "info", excerpt: "e", suggestion: "f" },
      ]),
    ).toEqual({ errorCount: 1, warnCount: 1, infoCount: 1 });
  });
});
