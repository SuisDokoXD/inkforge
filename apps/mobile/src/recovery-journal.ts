import type { Draft } from './platform';

function fallbackStorage(): RecoveryStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
export const RECOVERY_KEY_PREFIX = 'inkforge.mobile.validation.recovery:';

export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface RecoveryJournal {
  read(): { drafts: Draft[]; invalidIds: string[] };
  write(draft: Draft): void;
  clear(id: string): void;
}

export function createRecoveryJournal(storage: RecoveryStorage = fallbackStorage()): RecoveryJournal {
  return {
    read() {
      const drafts: Draft[] = [];
      const invalidIds: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(RECOVERY_KEY_PREFIX)) continue;
        const id = key.slice(RECOVERY_KEY_PREFIX.length);
        try {
          const value = JSON.parse(storage.getItem(key) ?? '') as Partial<Draft>;
          if (
            typeof value.id !== 'string' || value.id !== id ||
            typeof value.title !== 'string' || typeof value.text !== 'string' ||
            typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
          ) throw new Error('Invalid recovery entry');
          drafts.push({
            id: value.id,
            bookId: typeof value.bookId === 'string' ? value.bookId : 'book-local',
            title: value.title,
            text: value.text,
            updatedAt: value.updatedAt,
          });
        } catch {
          // Leave malformed records in place; surface them so startup can warn instead of silently erasing data.
          invalidIds.push(id);
        }
      }
      return { drafts, invalidIds };
    },
    write(draft) {
      storage.setItem(`${RECOVERY_KEY_PREFIX}${draft.id}`, JSON.stringify(draft));
    },
    clear(id) {
      storage.removeItem(`${RECOVERY_KEY_PREFIX}${id}`);
    },
  };
}

/** Prefer a newer local recovery snapshot and clear it only after durable persistence succeeds. */
export async function mergeRecoveryDrafts(
  persistedDrafts: Draft[],
  recoveryDrafts: Draft[],
  persistDraft: (draft: Draft) => Promise<void>,
  clearRecovery: (id: string) => void,
): Promise<{ drafts: Draft[]; failedDraftIds: string[] }> {
  const drafts = persistedDrafts.map(draft => ({ ...draft }));
  const failedDraftIds: string[] = [];

  for (const recovery of recoveryDrafts) {
    const index = drafts.findIndex(draft => draft.id === recovery.id);
    if (index >= 0 && recovery.updatedAt <= drafts[index].updatedAt) {
      clearRecovery(recovery.id);
      continue;
    }

    const snapshot = { ...recovery };
    if (index >= 0) drafts[index] = snapshot;
    else drafts.push(snapshot);

    try {
      await persistDraft(snapshot);
      clearRecovery(snapshot.id);
    } catch {
      // The recovered version stays visible in memory and in the journal for the next save/restart.
      failedDraftIds.push(snapshot.id);
    }
  }

  return { drafts, failedDraftIds };
}
