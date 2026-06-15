import { describe, expect, it } from "vitest";
import {
  CHAPTER_GENERATION_LIMITS,
  isTokenLimitFinish,
  looksAbruptlyCutOff,
  shouldContinueChapterDraft,
} from "../chapter-generation-service";

describe("CHAPTER_GENERATION_LIMITS", () => {
  it("keeps chapter generation permissive enough to favor complete drafts", () => {
    expect(CHAPTER_GENERATION_LIMITS.defaultMaxTokens).toBeGreaterThanOrEqual(10000);
    expect(CHAPTER_GENERATION_LIMITS.continuationMaxTokens).toBeGreaterThanOrEqual(4000);
    expect(CHAPTER_GENERATION_LIMITS.maxContinuations).toBeGreaterThanOrEqual(3);
  });
});

describe("isTokenLimitFinish", () => {
  it("detects token-limit finish reasons", () => {
    expect(isTokenLimitFinish("length")).toBe(true);
    expect(isTokenLimitFinish("max_tokens")).toBe(true);
    expect(isTokenLimitFinish("MAX_TOKENS")).toBe(true);
    expect(isTokenLimitFinish("token_limit")).toBe(true);
  });

  it("ignores normal stop reasons", () => {
    expect(isTokenLimitFinish("stop")).toBe(false);
    expect(isTokenLimitFinish(undefined)).toBe(false);
  });
});

describe("looksAbruptlyCutOff", () => {
  it("ignores long text that ends with punctuation", () => {
    expect(looksAbruptlyCutOff(`${"paragraph ".repeat(40)}.`)).toBe(false);
  });

  it("detects long text that ends mid-word", () => {
    expect(looksAbruptlyCutOff("paragraph ".repeat(40).trimEnd())).toBe(true);
  });

  it("ignores short text", () => {
    expect(looksAbruptlyCutOff("short")).toBe(false);
    expect(looksAbruptlyCutOff("")).toBe(false);
  });
});

describe("shouldContinueChapterDraft", () => {
  it("continues after token-limit finish", () => {
    expect(
      shouldContinueChapterDraft({
        text: `${"paragraph ".repeat(40)}.`,
        finishReason: "length",
      }),
    ).toBe(true);
  });

  it("continues after abrupt text cut-off", () => {
    expect(
      shouldContinueChapterDraft({
        text: "paragraph ".repeat(40).trimEnd(),
        finishReason: "stop",
      }),
    ).toBe(true);
  });

  it("stops after complete text", () => {
    expect(
      shouldContinueChapterDraft({
        text: `${"paragraph ".repeat(40)}.`,
        finishReason: "stop",
      }),
    ).toBe(false);
  });

  it("does not continue empty text", () => {
    expect(shouldContinueChapterDraft({ text: "", finishReason: "length" })).toBe(false);
  });
});
