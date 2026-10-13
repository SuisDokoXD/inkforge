import type { Draft, DraftStorage } from './platform';

/** Serialize snapshots so a slow earlier save cannot overwrite a newer edit. */
export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DraftStorage) {}
  save(draft: Draft): Promise<void> {
    const snapshot = { ...draft };
    const next = this.tail.catch(() => {}).then(() => this.storage.save(snapshot));
    this.tail = next;
    return next;
  }
  flush(): Promise<void> { return this.tail; }
}
