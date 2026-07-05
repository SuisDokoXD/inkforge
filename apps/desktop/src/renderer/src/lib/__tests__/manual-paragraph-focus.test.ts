import { describe, expect, it } from "vitest";
import {
  MANUAL_PARAGRAPH_FOCUS_LONG_GRAPHEMES,
  buildManualParagraphFocusOverview,
  extractManualParagraphFocusItems,
} from "../manual-paragraph-focus";

describe("manual paragraph focus", () => {
  it("extracts paragraph ranges and previews", () => {
    const items = extractManualParagraphFocusItems("第一段\n仍是第一段\n\n第二段");

    expect(items.map((item) => ({ startLine: item.startLine, endLine: item.endLine, preview: item.preview }))).toEqual([
      { startLine: 1, endLine: 2, preview: "第一段 仍是第一段" },
      { startLine: 4, endLine: 4, preview: "第二段" },
    ]);
  });

  it("focuses the paragraph at the current line", () => {
    const overview = buildManualParagraphFocusOverview("第一段\n\n第二段\n\n第三段", 3);

    expect(overview.current?.preview).toBe("第二段");
    expect(overview.previous?.preview).toBe("第一段");
    expect(overview.next?.preview).toBe("第三段");
    expect(overview.beatText).toBe("续写本段：第二段");
    expect(overview.handoffNote).toBe("本段停在第 3 行：第二段");
  });

  it("uses the previous paragraph when the cursor is on a blank line", () => {
    const overview = buildManualParagraphFocusOverview("第一段\n\n第二段", 2);

    expect(overview.current?.preview).toBe("第一段");
    expect(overview.next?.preview).toBe("第二段");
  });

  it("flags todo and long paragraphs", () => {
    const longText = `【待补：补情绪】${"字".repeat(MANUAL_PARAGRAPH_FOCUS_LONG_GRAPHEMES)}`;
    const overview = buildManualParagraphFocusOverview(longText, 1);

    expect(overview.current?.hasTodo).toBe(true);
    expect(overview.current?.isLong).toBe(true);
  });

  it("returns an empty overview for blank content", () => {
    expect(buildManualParagraphFocusOverview("\n\n", 1)).toEqual({
      current: null,
      previous: null,
      next: null,
      beatText: "",
      handoffNote: "",
    });
  });
});