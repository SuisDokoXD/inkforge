import { describe, expect, it } from 'vitest';
import type { Draft } from './platform';
import { createRecoveryJournal, mergeRecoveryDrafts, type RecoveryStorage } from './recovery-journal';

function memoryStorage(): RecoveryStorage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const draft = (text: string, updatedAt: number): Draft => ({
  id: 'chapter', bookId: 'book', title: '第一章', text, updatedAt,
});

describe('mobile recovery journal', () => {
  it('replays the newest journal entry after a simulated process restart', async () => {
    const durableLocalStorage = memoryStorage();
    createRecoveryJournal(durableLocalStorage).write(draft('旧稿之后的恢复稿', 20));
    const reopenedJournal = createRecoveryJournal(durableLocalStorage);
    const recovered = reopenedJournal.read();
    const committed: Draft[] = [draft('旧稿', 10)];

    const result = await mergeRecoveryDrafts(committed, recovered.drafts, async value => {
      committed.splice(0, committed.length, value);
    }, reopenedJournal.clear);

    expect(result.failedDraftIds).toEqual([]);
    expect(result.drafts[0].text).toBe('旧稿之后的恢复稿');
    expect(committed[0].text).toBe('旧稿之后的恢复稿');
    expect(reopenedJournal.read().drafts).toEqual([]);
  });

  it('keeps a newer recovery visible and durable when persistence fails, then retries it', async () => {
    const durableLocalStorage = memoryStorage();
    const journal = createRecoveryJournal(durableLocalStorage);
    journal.write(draft('最新恢复稿', 30));
    let persisted: Draft | undefined;

    const failed = await mergeRecoveryDrafts([draft('已提交稿', 10)], journal.read().drafts, async () => {
      throw new Error('disk unavailable');
    }, journal.clear);
    expect(failed.drafts[0].text).toBe('最新恢复稿');
    expect(failed.failedDraftIds).toEqual(['chapter']);
    expect(journal.read().drafts[0].text).toBe('最新恢复稿');

    const retried = await mergeRecoveryDrafts([draft('已提交稿', 10)], journal.read().drafts, async value => {
      persisted = value;
    }, journal.clear);
    expect(retried.failedDraftIds).toEqual([]);
    expect(retried.drafts[0].text).toBe('最新恢复稿');
    expect(persisted?.text).toBe('最新恢复稿');
    expect(journal.read().drafts).toEqual([]);
  });
});