import { describe, expect, it } from "vitest";
import {
  evaluateSegmentConstraints,
  extractPromptConstraints,
  renderPromptConstraintBlock,
} from "../prompt-constraints";

describe("prompt constraints", () => {
  it("extracts required and forbidden terms from explicit lists", () => {
    const constraints = extractPromptConstraints(
      "必须出现 A、B。关键词：青灯、雪桥。不要出现 C，D。",
    );

    expect(constraints.requiredTerms).toEqual(["A", "B", "青灯", "雪桥"]);
    expect(constraints.forbiddenTerms).toEqual(["C", "D"]);
  });

  it("separates mixed required and forbidden cues in one sentence", () => {
    const constraints = extractPromptConstraints("必须出现青灯、雪桥，不要出现旧王。");

    expect(constraints.requiredTerms).toEqual(["青灯", "雪桥"]);
    expect(constraints.forbiddenTerms).toEqual(["旧王"]);
  });

  it("extracts quoted and book-title terms under hard-rule cues", () => {
    const constraints = extractPromptConstraints(
      "务必写到“潮声”和《白塔》。禁止出现「旧王」。",
    );

    expect(constraints.requiredTerms).toEqual(["潮声", "白塔"]);
    expect(constraints.forbiddenTerms).toEqual(["旧王"]);
  });

  it("does not treat ordinary yao sentences as exact hard terms", () => {
    const constraints = extractPromptConstraints(
      "我要写一个下雨的开场，主角要慢慢走进城里。",
    );

    expect(constraints.requiredTerms).toEqual([]);
    expect(constraints.forbiddenTerms).toEqual([]);
    expect(constraints.rawHardRules).toEqual([]);
  });

  it("keeps long semantic rules as hard rules and boundaries, not exact terms", () => {
    const constraints = extractPromptConstraints(
      "必须让主角在雨中找到线索，但不能让反派提前知道真相。保持女主不知道旧约的剧情边界。",
    );

    expect(constraints.requiredTerms).toEqual([]);
    expect(constraints.forbiddenTerms).toEqual([]);
    expect(constraints.rawHardRules.length).toBeGreaterThan(0);
    expect(constraints.plotBoundaries.join("\n")).toContain("不能让反派提前知道真相");
    expect(constraints.plotBoundaries.join("\n")).toContain("保持女主不知道旧约");
  });

  it("deduplicates, trims whitespace, and caps exact term lists", () => {
    const terms = Array.from({ length: 40 }, (_, i) => `词${i + 1}`).join("、");
    const constraints = extractPromptConstraints(`关键词： 青灯 、青灯、 ${terms}`);

    expect(constraints.requiredTerms[0]).toBe("青灯");
    expect(constraints.requiredTerms.filter((term) => term === "青灯")).toHaveLength(1);
    expect(constraints.requiredTerms).toHaveLength(30);
  });

  it("renders current segment required terms separately from global bans", () => {
    const constraints = extractPromptConstraints("关键词：青灯、雪桥。不要出现旧王。");
    const block = renderPromptConstraintBlock(constraints, {
      currentText: "本段写青灯出现",
    });

    expect(block).toContain("本段必须直接落到正文的词条：「青灯」");
    expect(block).toContain("全局必写词条：「青灯」、「雪桥」");
    expect(block).toContain("全局禁止词条：「旧王」");
  });

  it("turns local coverage misses and forbidden terms into error findings", () => {
    const constraints = extractPromptConstraints("关键词：青灯。不要出现旧王。");
    const findings = evaluateSegmentConstraints({
      segmentText: "旧王站在门口。",
      promptConstraints: constraints,
      requiredTerms: ["青灯"],
    });

    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.severity === "error")).toBe(true);
    expect(findings.map((finding) => finding.suggestion).join("\n")).toContain("青灯");
    expect(findings.map((finding) => finding.suggestion).join("\n")).toContain("旧王");
  });
});
