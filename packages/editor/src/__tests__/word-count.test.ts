import { describe, expect, it } from "vitest";
import {
  computeWordCount,
  countChineseCharacters,
  countGraphemes,
  countWords,
  resolveTriggerCount,
} from "../word-count";

describe("word-count", () => {
  it("counts visible graphemes while ignoring whitespace", () => {
    expect(countGraphemes(" A 中\nB ")).toBe(3);
  });

  it("counts word-like English segments", () => {
    expect(countWords("hello, quiet world")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("counts Han script characters", () => {
    expect(countChineseCharacters("雪落在 Tokyo 的街角")).toBe(6);
  });

  it("computes the combined stats used by editor status and triggers", () => {
    expect(computeWordCount("Hi 世界")).toMatchObject({
      graphemes: 4,
      words: expect.any(Number),
      chinese: 2,
      characters: 5,
    });
  });

  it("uses words for English trigger thresholds and graphemes otherwise", () => {
    const stats = { graphemes: 10, words: 3, chinese: 2, characters: 12 };

    expect(resolveTriggerCount(stats, "en-US")).toBe(3);
    expect(resolveTriggerCount(stats, "zh-CN")).toBe(10);
  });
});
