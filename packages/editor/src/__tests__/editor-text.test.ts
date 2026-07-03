import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAGRAPH_INDENT,
  extractTodoMarkers,
  getFullWidthIndentDeleteCount,
  getNextEditorLineIndent,
  normalizeEditorText,
  normalizeManualSelection,
  normalizePastedText,
  plainTextToEditorHtml,
} from "../editor-text";

describe("editor text helpers", () => {
  it("keeps Markdown heading markers as literal text", () => {
    const html = plainTextToEditorHtml("# 第一章\n\n## 雨夜茶馆");

    expect(html).toContain("# 第一章");
    expect(html).toContain("## 雨夜茶馆");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
  });

  it("keeps scene breaks as literal Markdown text", () => {
    expect(plainTextToEditorHtml("开场\n\n---\n\n转场")).toContain("---");
  });

  it("renders leading spaces as full-width indentation in editor HTML", () => {
    expect(plainTextToEditorHtml("  缩进段落")).toContain("　　缩进段落");
  });

  it("normalizes pasted text without changing Markdown semantics", () => {
    expect(normalizePastedText("# 标题\r\n\t正文  \r\n---  ")).toBe("# 标题\n  正文\n---");
  });

  it("normalizes non-breaking spaces and zero-width characters", () => {
    expect(normalizeEditorText("甲\u00A0乙\u200B丙")).toBe("甲 乙丙");
  });

  it("chooses indentation for the next manual-writing paragraph", () => {
    expect(getNextEditorLineIndent("\u6b63\u6587\u5f00\u5934")).toBe(DEFAULT_PARAGRAPH_INDENT);
    expect(getNextEditorLineIndent("\u3000\u3000\u5df2\u6709\u7f29\u8fdb")).toBe(DEFAULT_PARAGRAPH_INDENT);
    expect(getNextEditorLineIndent("# \u7b2c\u4e00\u7ae0")).toBe("");
    expect(getNextEditorLineIndent("## \u5c0f\u8282")).toBe("");
    expect(getNextEditorLineIndent("---")).toBe("");
    expect(getNextEditorLineIndent("   ")).toBe("");
  });

  it("deletes a full-width indentation unit at paragraph start", () => {
    expect(getFullWidthIndentDeleteCount("\u3000\u3000")).toBe(2);
    expect(getFullWidthIndentDeleteCount("\u3000")).toBe(1);
    expect(getFullWidthIndentDeleteCount("\u3000\u3000\u6b63\u6587")).toBe(0);
  });

  it("extracts manual-writing todo markers with line numbers and occurrences", () => {
    const markers = extractTodoMarkers("chapter-1", "第一行\n正文【待补：动机】\nTODO: 查地名\n【待补：动机】");

    expect(markers).toEqual([
      expect.objectContaining({ chapterId: "chapter-1", title: "动机", line: 2, raw: "【待补：动机】", occurrence: 0 }),
      expect.objectContaining({ chapterId: "chapter-1", title: "查地名", line: 3, raw: "TODO: 查地名", occurrence: 0 }),
      expect.objectContaining({ chapterId: "chapter-1", title: "动机", line: 4, raw: "【待补：动机】", occurrence: 1 }),
    ]);
  });

  it("normalizes only low-risk manual selection formatting", () => {
    expect(normalizeManualSelection("  正文  \n\u200B\n\n\n\t下一段\t")).toBe("\u3000\u3000正文\n\n\u3000\u3000下一段");
  });
});