import { describe, expect, it } from "vitest";
import {
  currentManualChapterMapItem,
  extractManualChapterMap,
  filterManualChapterMapItems,
} from "../manual-chapter-map";

describe("manual chapter map", () => {
  it("extracts headings, scene breaks, and todos in line order", () => {
    const items = extractManualChapterMap(
      "chapter-1",
      "# 雨夜\n\n正文\n---\n【待补：补动机】\n## 茶馆\nTODO: 查地名",
    );

    expect(items.map((item) => `${item.kind}:${item.line}:${item.label}`)).toEqual([
      "heading:1:雨夜",
      "scene:4:场景 1",
      "todo:5:补动机",
      "heading:6:茶馆",
      "todo:7:查地名",
    ]);
  });

  it("tracks repeated scene break occurrences by raw marker", () => {
    const items = extractManualChapterMap("chapter-1", "---\n正文\n---\n***\n---");
    const scenes = filterManualChapterMapItems(items, "scene");

    expect(scenes.map((item) => ({
      raw: item.raw,
      occurrence: item.occurrence,
      label: item.label,
      line: item.line,
    }))).toEqual([
      { raw: "---", occurrence: 0, label: "场景 1", line: 1 },
      { raw: "---", occurrence: 1, label: "场景 2", line: 3 },
      { raw: "***", occurrence: 0, label: "场景 3", line: 4 },
      { raw: "---", occurrence: 2, label: "场景 4", line: 5 },
    ]);
  });

  it("tracks repeated heading occurrences by raw marker", () => {
    const items = extractManualChapterMap("chapter-1", "# 转折\n正文\n# 转折\n## 转折");
    const headings = filterManualChapterMapItems(items, "heading");

    expect(headings.map((item) => ({ raw: item.raw, occurrence: item.occurrence, line: item.line }))).toEqual([
      { raw: "# 转折", occurrence: 0, line: 1 },
      { raw: "# 转折", occurrence: 1, line: 3 },
      { raw: "## 转折", occurrence: 0, line: 4 },
    ]);
  });

  it("filters by item kind", () => {
    const items = extractManualChapterMap("chapter-1", "# 标题\n---\n【待补：线索】");

    expect(filterManualChapterMapItems(items, "heading")).toHaveLength(1);
    expect(filterManualChapterMapItems(items, "scene")).toHaveLength(1);
    expect(filterManualChapterMapItems(items, "todo")).toHaveLength(1);
    expect(filterManualChapterMapItems(items, "all")).toHaveLength(3);
  });

  it("resolves the current nearest item by cursor line", () => {
    const items = extractManualChapterMap("chapter-1", "# 开始\n正文\n---\n正文\n## 转折");

    expect(currentManualChapterMapItem(items, 1)?.label).toBe("开始");
    expect(currentManualChapterMapItem(items, 4)?.label).toBe("场景 1");
    expect(currentManualChapterMapItem(items, 99)?.label).toBe("转折");
    expect(currentManualChapterMapItem([], 1)).toBeNull();
  });
});
