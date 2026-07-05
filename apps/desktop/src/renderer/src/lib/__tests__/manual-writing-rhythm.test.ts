import { describe, expect, it } from "vitest";
import {
  MANUAL_RHYTHM_DEFAULT_GOAL,
  MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH,
  MANUAL_RHYTHM_MAX_OPEN_BEATS,
  MANUAL_RHYTHM_MAX_TOTAL_BEATS,
  addManualWritingBeat,
  buildManualWritingHandoffCapture,
  buildManualWritingResumeCue,
  clampManualWritingGoal,
  completeManualWritingBeat,
  createDefaultManualWritingRhythmState,
  createManualWritingBeat,
  firstOpenManualWritingBeat,
  formatManualWritingDuration,
  manualWritingOpenBeatCount,
  manualWritingProgressPercent,
  moveManualWritingBeat,
  normalizeHandoffNote,
  normalizeManualWritingBeatQueue,
  normalizeRhythmSnippet,
  openManualWritingBeats,
  parseManualWritingRhythmState,
  readManualWritingCue,
  removeManualWritingBeat,
  reopenManualWritingBeat,
  upsertManualWritingBeat,
  type ManualWritingBeatItem,
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

  it("reads a handoff cue from the current line or nearest previous prose", () => {
    const content = "第一段\n\n  第二段继续推进冲突  \n";

    expect(readManualWritingCue(content, 3)).toEqual({ line: 3, text: "第二段继续推进冲突" });
    expect(readManualWritingCue(content, 4)).toEqual({ line: 3, text: "第二段继续推进冲突" });
    expect(readManualWritingCue("\n\n", 2)).toEqual({ line: 2, text: "" });
  });

  it("builds a capture payload for closing a writing session", () => {
    const capture = buildManualWritingHandoffCapture("第一段\n雨停之后，她终于开口。", 2, 12_345);

    expect(capture).toEqual({
      line: 2,
      cueText: "雨停之后，她终于开口。",
      handoffNote: "第 2 行：雨停之后，她终于开口。",
      capturedAt: 12_345,
    });
    expect(buildManualWritingHandoffCapture("\n", 1, 12_345)).toBeNull();
  });

  it("computes bounded progress against the session goal", () => {
    expect(manualWritingProgressPercent(0, 800)).toBe(0);
    expect(manualWritingProgressPercent(400, 800)).toBe(50);
    expect(manualWritingProgressPercent(1200, 800)).toBe(100);
  });

  it("migrates legacy next beat into the first open queue item", () => {
    const state = parseManualWritingRhythmState(JSON.stringify({ nextBeat: "  去写雨夜重逢  " }));

    expect(state.nextBeat).toBe("去写雨夜重逢");
    expect(state.beatQueue).toHaveLength(1);
    expect(state.beatQueue[0]).toMatchObject({ text: "去写雨夜重逢", status: "open" });
  });

  it("cleans blank and overlong beat items", () => {
    const longBeat = "转".repeat(130);
    const queue = normalizeManualWritingBeatQueue([
      { id: "blank", text: "   ", status: "open", createdAt: 1, updatedAt: 1 },
      { id: "long", text: longBeat, status: "open", createdAt: 2, updatedAt: 2 },
      { id: "done", text: "  收尾\n伏笔  ", status: "done", createdAt: 3, updatedAt: 4 },
    ], "", 10);

    expect(queue.map((item) => item.id)).toEqual(["long", "done"]);
    expect(queue[0]?.text).toHaveLength(120);
    expect(queue[0]?.text.endsWith("…")).toBe(true);
    expect(queue[1]).toMatchObject({ text: "收尾 伏笔", status: "done" });
  });

  it("finds the first open beat and open count", () => {
    const state = createDefaultManualWritingRhythmState({
      beatQueue: [
        beat("done", "已完成", "done", 1),
        beat("open-a", "先写冲突", "open", 2),
        beat("open-b", "再写转折", "open", 3),
      ],
    });

    expect(openManualWritingBeats(state).map((item) => item.text)).toEqual(["先写冲突", "再写转折"]);
    expect(firstOpenManualWritingBeat(state)?.id).toBe("open-a");
    expect(manualWritingOpenBeatCount(state)).toBe(2);
    expect(state.nextBeat).toBe("先写冲突");
  });

  it("adds, edits, completes, reopens, removes, and moves queue items", () => {
    let state = createDefaultManualWritingRhythmState({
      beatQueue: [beat("a", "第一件事", "open", 1)],
    });

    state = addManualWritingBeat(state, "第二件事", 2);
    expect(state.beatQueue.map((item) => item.text)).toEqual(["第一件事", "第二件事"]);

    const addedId = state.beatQueue[1]?.id ?? "";
    state = upsertManualWritingBeat(state, addedId, "第二件事改写", 3);
    expect(state.beatQueue[1]).toMatchObject({ text: "第二件事改写", updatedAt: 3 });

    state = moveManualWritingBeat(state, addedId, "up");
    expect(state.beatQueue.map((item) => item.text)).toEqual(["第二件事改写", "第一件事"]);

    state = completeManualWritingBeat(state, addedId, 4);
    expect(state.beatQueue[0]).toMatchObject({ status: "done", updatedAt: 4 });
    expect(state.nextBeat).toBe("第一件事");

    state = reopenManualWritingBeat(state, addedId, 5);
    expect(state.beatQueue[0]).toMatchObject({ status: "open", updatedAt: 5 });
    expect(state.nextBeat).toBe("第二件事改写");

    state = removeManualWritingBeat(state, addedId);
    expect(state.beatQueue.map((item) => item.id)).toEqual(["a"]);
    expect(state.nextBeat).toBe("第一件事");
  });

  it("does not recreate a removed last beat from the compatibility field", () => {
    const state = createDefaultManualWritingRhythmState({
      beatQueue: [beat("a", "唯一接力", "open", 1)],
    });

    const next = removeManualWritingBeat(state, "a");

    expect(next.beatQueue).toEqual([]);
    expect(next.nextBeat).toBe("");
  });

  it("caps open beats at eight and total history at twenty", () => {
    const queue: ManualWritingBeatItem[] = [
      ...Array.from({ length: 10 }, (_, index) => beat(`open-${index + 1}`, `未完 ${index + 1}`, "open", index + 1)),
      ...Array.from({ length: 20 }, (_, index) => beat(`done-${index + 1}`, `完成 ${index + 1}`, "done", 100 + index)),
    ];

    const normalized = normalizeManualWritingBeatQueue(queue);

    expect(normalized).toHaveLength(MANUAL_RHYTHM_MAX_TOTAL_BEATS);
    expect(normalized.filter((item) => item.status === "open")).toHaveLength(MANUAL_RHYTHM_MAX_OPEN_BEATS);
    expect(normalized.some((item) => item.id === "open-9")).toBe(false);
    expect(normalized.some((item) => item.id === "done-1")).toBe(false);
    expect(normalized.some((item) => item.id === "done-20")).toBe(true);
  });

  it("normalizes and truncates handoff notes", () => {
    expect(normalizeHandoffNote("  停在门口\n下次接对话  ")).toBe("停在门口 下次接对话");
    expect(normalizeHandoffNote("收".repeat(200))).toHaveLength(MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH);
  });

  it("creates deterministic beat items for tests when an id is provided", () => {
    expect(createManualWritingBeat("写一场争执", 123, "fixed")).toEqual({
      id: "fixed",
      text: "写一场争执",
      status: "open",
      createdAt: 123,
      updatedAt: 123,
    });
  });
});

function beat(
  id: string,
  text: string,
  status: "open" | "done",
  timestamp: number,
): ManualWritingBeatItem {
  return {
    id,
    text,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
