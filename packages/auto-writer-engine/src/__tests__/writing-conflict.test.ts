import { describe, expect, it } from "vitest";
import { parseWritingConflictAnalysis } from "../writing-conflict";

describe("writing-conflict", () => {
  it("parses a structured conflict analysis", () => {
    const result = parseWritingConflictAnalysis(`\`\`\`json
{
  "reconcilable": true,
  "summary": "用户要求明确，但生成稿漏掉了禁止项。",
  "rootCause": "constraint-history",
  "extraConstraints": "下一次必须避开旧王。",
  "suggestedActions": [
    {
      "id": "retry",
      "label": "重新生成",
      "description": "带着补充约束重新生成本章。"
    }
  ]
}
\`\`\``);

    expect(result).toEqual({
      reconcilable: true,
      summary: "用户要求明确，但生成稿漏掉了禁止项。",
      rootCause: "constraint-history",
      extraConstraints: "下一次必须避开旧王。",
      suggestedActions: [
        {
          id: "retry",
          label: "重新生成",
          description: "带着补充约束重新生成本章。",
        },
      ],
    });
  });

  it("normalizes unknown root causes and filters unknown actions", () => {
    const result = parseWritingConflictAnalysis(JSON.stringify({
      reconcilable: false,
      summary: "前情和大纲矛盾。",
      rootCause: "unknown",
      suggestedActions: [
        { id: "bad-action", label: "bad", description: "bad" },
        { id: "edit-outline", label: "", description: "" },
      ],
    }));

    expect(result.rootCause).toBe("other");
    expect(result.suggestedActions).toEqual([
      {
        id: "edit-outline",
        label: "调整大纲",
        description: "调整大纲",
      },
    ]);
  });

  it("returns a keep-draft fallback for invalid text", () => {
    const result = parseWritingConflictAnalysis("not json");

    expect(result.reconcilable).toBe(false);
    expect(result.rootCause).toBe("other");
    expect(result.summary).toContain("无法解析");
    expect(result.suggestedActions[0]?.id).toBe("keep-draft");
  });
});
