import { describe, expect, it } from "vitest";
import { buildManualRevisionQueueItems } from "../manual-revision-queue";

describe("manual revision queue helpers", () => {
  it("builds revision items from Chinese and TODO markers", () => {
    const items = buildManualRevisionQueueItems(
      "chapter-1",
      "第一行\n正文【待补：动机】继续\nTODO: 查地名",
    );

    expect(items).toEqual([
      expect.objectContaining({
        chapterId: "chapter-1",
        title: "动机",
        line: 2,
        raw: "【待补：动机】",
        occurrence: 0,
        preview: "正文【待补：动机】继续",
      }),
      expect.objectContaining({
        title: "查地名",
        line: 3,
        raw: "TODO: 查地名",
        occurrence: 0,
        preview: "TODO: 查地名",
      }),
    ]);
  });

  it("keeps occurrence indexes for repeated raw markers", () => {
    const items = buildManualRevisionQueueItems(
      "chapter-1",
      "正文【待补：动机】\n第二处【待补：动机】",
    );

    expect(items.map((item) => ({ raw: item.raw, occurrence: item.occurrence, line: item.line }))).toEqual([
      { raw: "【待补：动机】", occurrence: 0, line: 1 },
      { raw: "【待补：动机】", occurrence: 1, line: 2 },
    ]);
  });

  it("uses fallback title and compact preview", () => {
    const items = buildManualRevisionQueueItems(
      "chapter-1",
      `  ${"很长的句子".repeat(20)}【待补：】  `,
    );

    expect(items[0]?.title).toBe("待补");
    expect(items[0]?.preview.length).toBeLessThanOrEqual(96);
    expect(items[0]?.preview.endsWith("…")).toBe(true);
  });
});
