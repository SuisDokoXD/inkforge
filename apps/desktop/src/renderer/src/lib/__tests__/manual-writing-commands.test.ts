import { describe, expect, it } from "vitest";
import {
  MANUAL_WRITING_COMMANDS,
  manualWritingCommandDisabledReason,
  matchManualWritingShortcut,
} from "../manual-writing-commands";

describe("manual writing commands", () => {
  it("keeps visible command ids unique", () => {
    const ids = MANUAL_WRITING_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches command menu and writing shortcuts", () => {
    expect(matchManualWritingShortcut({ key: "m", code: "KeyM", ctrlKey: true, altKey: true })).toBe("open-command-menu");
    expect(matchManualWritingShortcut({ key: "1", code: "Digit1", ctrlKey: true, altKey: true })).toBe("insert-heading-1");
    expect(matchManualWritingShortcut({ key: "2", code: "Digit2", metaKey: true, altKey: true })).toBe("insert-heading-2");
    expect(matchManualWritingShortcut({ key: "-", code: "Minus", ctrlKey: true, altKey: true })).toBe("insert-scene-break");
    expect(matchManualWritingShortcut({ key: "]", code: "BracketRight", ctrlKey: true, altKey: true })).toBe("insert-indent");
    expect(matchManualWritingShortcut({ key: "T", code: "KeyT", ctrlKey: true, altKey: true })).toBe("insert-todo");
    expect(matchManualWritingShortcut({ key: "g", code: "KeyG", ctrlKey: true, altKey: true })).toBe("open-chapter-map");
    expect(matchManualWritingShortcut({ key: "r", code: "KeyR", ctrlKey: true, altKey: true })).toBe("open-revision-queue");
    expect(matchManualWritingShortcut({ key: "i", code: "KeyI", ctrlKey: true, altKey: true })).toBe("open-chapter-health");
    expect(matchManualWritingShortcut({ key: "j", code: "KeyJ", ctrlKey: true, altKey: true })).toBe("jump-next-todo");
  });

  it("ignores plain, shifted, and non-alt shortcuts", () => {
    expect(matchManualWritingShortcut({ key: "m", code: "KeyM", ctrlKey: true })).toBeNull();
    expect(matchManualWritingShortcut({ key: "m", code: "KeyM", altKey: true })).toBeNull();
    expect(matchManualWritingShortcut({ key: "m", code: "KeyM", ctrlKey: true, altKey: true, shiftKey: true })).toBeNull();
  });

  it("reports disabled reasons from editor state", () => {
    expect(manualWritingCommandDisabledReason("insert-todo", {
      hasEditor: false,
      chapterMapCount: 1,
      revisionCount: 1,
      healthIssueCount: 1,
    })).toBe("当前章节尚未载入");

    expect(manualWritingCommandDisabledReason("open-chapter-map", {
      hasEditor: true,
      chapterMapCount: 0,
      revisionCount: 1,
      healthIssueCount: 1,
    })).toBe("暂无导航标记");

    expect(manualWritingCommandDisabledReason("jump-next-todo", {
      hasEditor: true,
      chapterMapCount: 1,
      revisionCount: 0,
      healthIssueCount: 1,
    })).toBe("暂无待补");

    expect(manualWritingCommandDisabledReason("jump-first-health-issue", {
      hasEditor: true,
      chapterMapCount: 1,
      revisionCount: 1,
      healthIssueCount: 0,
    })).toBe("暂无提醒");
  });
});
