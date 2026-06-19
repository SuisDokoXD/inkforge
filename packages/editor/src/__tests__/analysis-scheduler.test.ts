import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisScheduler } from "../analysis-scheduler";

const cjk = (n: number): string => "字".repeat(n);

function makeScheduler(onTrigger = vi.fn(), threshold = 10, debounceMs = 1000) {
  const scheduler = new AnalysisScheduler({
    threshold,
    debounceMs,
    language: "zh",
    onTrigger,
  });
  return { scheduler, onTrigger, debounceMs };
}

describe("AnalysisScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not fire before the new-char delta crosses the threshold", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset("");
    scheduler.update(cjk(9));
    vi.advanceTimersByTime(debounceMs * 2);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("fires once the delta crosses the threshold, after the debounce", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset("");
    scheduler.update(cjk(10));
    expect(onTrigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(debounceMs);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("does not fire when a full chapter is loaded via reset", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset("");
    scheduler.reset(cjk(5000));
    scheduler.update(cjk(5000));
    vi.advanceTimersByTime(debounceMs * 2);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("only counts chars typed after the last re-baseline", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset(cjk(5000));
    scheduler.update(cjk(5005));
    vi.advanceTimersByTime(debounceMs);
    expect(onTrigger).not.toHaveBeenCalled();
    scheduler.update(cjk(5010));
    vi.advanceTimersByTime(debounceMs);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("re-baseline cancels a pending debounce", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset("");
    scheduler.update(cjk(10));
    scheduler.reset(cjk(99));
    vi.advanceTimersByTime(debounceMs * 2);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("forceTrigger fires immediately and re-bases so auto-trigger will not double-fire", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset(cjk(100));
    scheduler.forceTrigger();
    expect(onTrigger).toHaveBeenCalledTimes(1);
    scheduler.update(cjk(100));
    vi.advanceTimersByTime(debounceMs * 2);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("stops firing after dispose", () => {
    const { scheduler, onTrigger, debounceMs } = makeScheduler();
    scheduler.reset("");
    scheduler.update(cjk(10));
    scheduler.dispose();
    vi.advanceTimersByTime(debounceMs * 2);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
