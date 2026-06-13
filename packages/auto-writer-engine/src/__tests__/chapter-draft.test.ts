import { describe, expect, it } from "vitest";
import {
  countNonWhitespaceGraphemes,
  prepareGeneratedChapterDraft,
  removeConsecutiveDuplicateMarkdownHeadings,
  tailText,
} from "../chapter-draft";

describe("chapter draft helpers", () => {
  it("counts non-whitespace codepoints for mixed Chinese and Latin text", () => {
    expect(countNonWhitespaceGraphemes("一 二\nA\tB")).toBe(4);
    expect(countNonWhitespaceGraphemes("  \n\t")).toBe(0);
  });

  it("returns a trimmed tail with the existing ellipsis marker", () => {
    expect(tailText("  abc  ", 10)).toBe("abc");
    expect(tailText("abcdef", 3)).toBe("…def");
  });

  it("removes duplicate adjacent markdown headings without deleting real sections", () => {
    expect(
      removeConsecutiveDuplicateMarkdownHeadings(
        [
          "## 雨巷",
          "",
          "## 雨巷",
          "雨落下来。",
          "## 雨巷",
          "第二次回到雨巷。",
        ].join("\r\n"),
      ),
    ).toBe(["## 雨巷", "", "雨落下来。", "## 雨巷", "第二次回到雨巷。"].join("\n"));
  });

  it("prepares generated chapter markdown and falls back to the default title", () => {
    expect(
      prepareGeneratedChapterDraft({
        title: "  ",
        text: "## 开始\n\n## 开始\n正文",
      }),
    ).toEqual({
      title: "AI 生成章节",
      cleanedText: "## 开始\n\n正文",
      markdown: "# AI 生成章节\n\n## 开始\n\n正文\n",
      wordCount: 6,
    });
  });
});
