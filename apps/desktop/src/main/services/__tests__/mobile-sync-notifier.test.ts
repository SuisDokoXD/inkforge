import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileSyncCompletedEvent } from "@inkforge/shared";
import { publishMobileSyncCompleted, subscribeMobileSyncCompleted } from "../mobile-sync-notifier";

const event: MobileSyncCompletedEvent = {
  deviceName: "InkForge Android",
  projectCount: 2,
  chapterCount: 5,
  conflictCount: 1,
  syncedAt: "2026-10-16T17:00:00.000Z",
};

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
});

describe("mobile sync completion notifications", () => {
  it("publishes the synchronization summary to active desktop listeners", () => {
    const listener = vi.fn();
    unsubscribers.push(subscribeMobileSyncCompleted(listener));

    publishMobileSyncCompleted(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("isolates failing listeners and supports unsubscribe", () => {
    const first = vi.fn(() => { throw new Error("renderer closed"); });
    const second = vi.fn();
    const unsubscribe = subscribeMobileSyncCompleted(first);
    unsubscribers.push(subscribeMobileSyncCompleted(second));

    expect(() => publishMobileSyncCompleted(event)).not.toThrow();
    unsubscribe();
    publishMobileSyncCompleted(event);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });
});
