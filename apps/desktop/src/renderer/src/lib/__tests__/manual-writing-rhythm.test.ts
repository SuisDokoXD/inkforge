import { describe, expect, it } from "vitest";
import {
  MANUAL_RHYTHM_DEFAULT_GOAL,
  buildManualWritingResumeCue,
  clampManualWritingGoal,
  createDefaultManualWritingRhythmState,
  formatManualWritingDuration,
  manualWritingProgressPercent,
  normalizeRhythmSnippet,
  parseManualWritingRhythmState,
} from "../manual-writing-rhythm";

describe("manual writing rhythm helpers", () => {
  it("falls back to default state for missing or corrupted storage", () => {
    expect(parseManualWritingRhythmState(null)).toEqual(createDefaultManualWritingRhythmState());
    expect(parseManualWritingRhythmState("{broken")).toEqual(createDefaultManualWritingRhythmState());
  });

  it("clamps session goal into the supported writing range", () => {
    expect(clampManualWritingGoal(12)).toBe(100);
    expect(clampManualWritingGoal(20_000)).toBe(10_000);
    expect(clampManualWritingGoal("1250")).toBe(1250);
    expect(clampManualWritingGoal("not-a-number")).toBe(MANUAL_RHYTHM_DEFAULT_GOAL);
  });

  it("normalizes cue snippets to one compact line", () => {
    expect(normalizeRhythmSnippet("  第一行\n第二行\t第三行  ", 20)).toBe("第一行 第二行 第三行");
    expect(normalizeRhythmSnippet("1234567890", 6)).toBe("12345…");
  });

  it("formats active writing duration", () => {
    expect(formatManualWritingDuration(0)).toBe("00:00");
    expect(formatManualWritingDuration(65_000)).toBe("01:05");
    expect(formatManualWritingDuration(3_665_000)).toBe("1:01:05");
  });

  it("shows resume cue only after the quiet threshold", () => {
    const state = createDefaultManualWritingRhythmState({
      lastCueText: "他推开门，看见雨线后的灯。",
      lastLine: 42,
      lastUpdatedAt: 1_000,
    });

    expect(buildManualWritingResumeCue(state, 1_000 + 9 * 60 * 1000)).toBeNull();
    expect(buildManualWritingResumeCue(state, 1_000 + 11 * 60 * 1000)).toEqual({
      line: 42,
      text: "他推开门，看见雨线后的灯。",
    });
  });

  it("computes bounded progress against the session goal", () => {
    expect(manualWritingProgressPercent(0, 800)).toBe(0);
    expect(manualWritingProgressPercent(400, 800)).toBe(50);
    expect(manualWritingProgressPercent(1200, 800)).toBe(100);
  });
});
