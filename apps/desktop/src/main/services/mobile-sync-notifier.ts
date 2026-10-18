import type { MobileSyncCompletedEvent } from "@inkforge/shared";

type MobileSyncCompletedListener = (event: MobileSyncCompletedEvent) => void;
const listeners = new Set<MobileSyncCompletedListener>();

export function subscribeMobileSyncCompleted(listener: MobileSyncCompletedListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Renderer notifications must never turn an already-committed sync into an HTTP failure. */
export function publishMobileSyncCompleted(event: MobileSyncCompletedEvent): void {
  for (const listener of [...listeners]) {
    try { listener(event); } catch { /* a closed renderer must not affect sync persistence */ }
  }
}
