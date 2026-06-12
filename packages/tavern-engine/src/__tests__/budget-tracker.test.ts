import { describe, expect, it } from "vitest";
import { BudgetTracker, estimateTokensFromText } from "../budget-tracker";

describe("estimateTokensFromText", () => {
  it("estimates ascii, CJK, and other characters separately", () => {
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("abcde")).toBe(2);
    expect(estimateTokensFromText("中文")).toBe(3);
    expect(estimateTokensFromText("🙂")).toBe(2);
  });
});

describe("BudgetTracker", () => {
  it("tracks usage and warning threshold", () => {
    const tracker = new BudgetTracker({
      sessionId: "session-1",
      budgetTokens: 100,
      warnRemainingRatio: 0.25,
      safetyPaddingTokens: 10,
    });

    tracker.recordUsage({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    const state = tracker.recordUsage(undefined, 45);

    expect(state).toMatchObject({
      sessionId: "session-1",
      budgetTokens: 100,
      usedTokens: 75,
      remainingTokens: 25,
      shouldWarn: true,
    });
    expect(state.warnAt).toEqual(expect.any(String));
    expect(tracker.warnThreshold).toBe(25);
  });

  it("requests compaction when the next round would exceed the padded budget", () => {
    const tracker = new BudgetTracker({
      sessionId: "session-1",
      budgetTokens: 100,
      safetyPaddingTokens: 15,
    });
    tracker.seed(70);

    expect(tracker.shouldCompactBeforeNextRound(10)).toBe(false);
    expect(tracker.shouldCompactBeforeNextRound(20)).toBe(true);
  });

  it("rejects invalid construction options", () => {
    expect(() => new BudgetTracker({ sessionId: "", budgetTokens: 100 })).toThrow(
      "sessionId required",
    );
    expect(() => new BudgetTracker({ sessionId: "session-1", budgetTokens: 0 })).toThrow(
      "budgetTokens must be a positive finite number",
    );
  });
});
