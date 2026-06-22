import { describe, expect, it } from "vitest";
import {
  extractPlotCommitments,
  extractPlotCommitmentsFromText,
  mergePlotCommitments,
  renderPlotCommitmentsBlock,
} from "../plot-commitments";

describe("plot-commitments", () => {
  it("extracts foreshadow, payoff, reveal, and avoid-reveal commitments", () => {
    const result = extractPlotCommitmentsFromText(
      "埋下「青灯」伏笔。回收《雪桥》线索。揭示真相。不要提前揭示“旧王”。",
      "userIdeas",
    );

    expect(result).toEqual([
      {
        kind: "foreshadow",
        text: "埋下「青灯」伏笔",
        exactTerms: ["青灯"],
        source: "userIdeas",
      },
      {
        kind: "payoff",
        text: "回收《雪桥》线索",
        exactTerms: ["雪桥"],
        source: "userIdeas",
      },
      {
        kind: "reveal",
        text: "揭示真相",
        exactTerms: [],
        source: "userIdeas",
      },
      {
        kind: "avoid-reveal",
        text: "不要提前揭示“旧王”",
        exactTerms: ["旧王"],
        source: "userIdeas",
      },
    ]);
  });

  it("combines user ideas, corrections, and outline text", () => {
    const result = extractPlotCommitments({
      userIdeas: "埋下「青灯」伏笔。",
      corrections: [
        { at: "2026-06-22T00:00:00.000Z", content: "回收雪桥线索。" },
      ],
      outlineTexts: ["不要提前暴露旧王身份。"],
    });

    expect(result).toEqual([
      {
        kind: "foreshadow",
        text: "埋下「青灯」伏笔",
        exactTerms: ["青灯"],
        source: "userIdeas",
      },
      {
        kind: "payoff",
        text: "回收雪桥线索",
        exactTerms: [],
        source: "correction",
      },
      {
        kind: "avoid-reveal",
        text: "不要提前暴露旧王身份",
        exactTerms: [],
        source: "outline",
      },
    ]);
  });

  it("merges commitments and renders a compact prompt block", () => {
    const merged = mergePlotCommitments(
      extractPlotCommitmentsFromText("埋下「青灯」伏笔。", "userIdeas"),
      extractPlotCommitmentsFromText("回收《雪桥》线索。", "correction"),
    );

    const block = renderPlotCommitmentsBlock(merged);

    expect(merged).toHaveLength(2);
    expect(block).toContain("剧情承诺/伏笔清单");
    expect(block).toContain("foreshadow｜userIdeas");
    expect(block).toContain("payoff｜correction");
    expect(block).toContain("「青灯」");
    expect(block).toContain("「雪桥」");
  });
});
