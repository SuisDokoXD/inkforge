import { describe, expect, it } from "vitest";
import { extractManualChapterMap } from "../manual-chapter-map";
import { buildManualChapterStructureOverview } from "../manual-chapter-structure";

describe("manual chapter structure overview", () => {
  it("summarizes markers around the current line", () => {
    const items = extractManualChapterMap(
      "chapter-1",
      "# 雨夜\n正文\n---\n冲突展开\n【待补：补动机】\n## 茶馆\n对话",
    );

    const overview = buildManualChapterStructureOverview(items, 4);

    expect(overview.counts).toEqual({ headings: 2, scenes: 1, todos: 1, total: 4 });
    expect(overview.currentItem?.label).toBe("场景 1");
    expect(overview.nextItem?.label).toBe("补动机");
    expect(overview.suggestions.map((item) => item.beatText)).toEqual([
      "续写：场景 1",
      "补上：补动机",
    ]);
  });

  it("falls back to the first todo when the cursor is past all markers", () => {
    const items = extractManualChapterMap("chapter-1", "# 开头\n【待补：补伏笔】\n正文");
    const overview = buildManualChapterStructureOverview(items, 99);

    expect(overview.currentItem?.label).toBe("补伏笔");
    expect(overview.nextItem).toBeNull();
    expect(overview.suggestions.map((item) => item.beatText)).toEqual(["补上：补伏笔"]);
  });

  it("returns an empty overview for chapters without structure markers", () => {
    const overview = buildManualChapterStructureOverview([], 3);

    expect(overview.counts).toEqual({ headings: 0, scenes: 0, todos: 0, total: 0 });
    expect(overview.currentItem).toBeNull();
    expect(overview.nextItem).toBeNull();
    expect(overview.suggestions).toEqual([]);
  });
});