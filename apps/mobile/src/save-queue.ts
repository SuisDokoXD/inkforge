import type { Draft, DraftStorage } from './platform';

/** Serialize snapshots and skip stale writes that have not reached storage yet. */
export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();
  private latestTimestamp = new Map<string, number>();
  constructor(private readonly storage: DraftStorage) {}
  save(draft: Draft): Promise<void> {
    const snapshot = { ...draft };
    const latest = this.latestTimestamp.get(snapshot.id);
    if (latest !== undefined && snapshot.updatedAt < latest) return this.tail;

    this.latestTimestamp.set(snapshot.id, Math.max(latest ?? snapshot.updatedAt, snapshot.updatedAt));
    const next = this.tail.catch(() => {}).then(async () => {
      if ((this.latestTimestamp.get(snapshot.id) ?? snapshot.updatedAt) > snapshot.updatedAt) return;
      await this.storage.save(snapshot);
    });
    this.tail = next;
    return next;
  }
  flush(): Promise<void> { return this.tail; }
}
