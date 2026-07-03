import { describe, expect, it } from "vitest";
import { findTextMatches } from "../find-replace";
describe("findTextMatches", () => {
  it("finds plain text matches in order", () => {
    expect(findTextMatches("雨夜茶馆，雨夜来客", "雨夜", {
      caseSensitive: true,
      wholeWord: false,
    })).toEqual([
      { index: 0, length: 2, text: "雨夜" },
      { index: 5, length: 2, text: "雨夜" },
    ]);
  });
  it("supports case-insensitive matching", () => {
    expect(findTextMatches("Echo echo ECHO", "echo", {
      caseSensitive: false,
      wholeWord: false,
    })).toHaveLength(3);
  });
  it("respects whole word boundaries for English text", () => {
    expect(findTextMatches("cat scatter cat_2 cat", "cat", {
      caseSensitive: true,
      wholeWord: true,
    })).toEqual([
      { index: 0, length: 3, text: "cat" },
      { index: 18, length: 3, text: "cat" },
    ]);
  });
  it("returns no matches for an empty query", () => {
    expect(findTextMatches("正文", "", {
      caseSensitive: true,
      wholeWord: false,
    })).toEqual([]);
  });
});

