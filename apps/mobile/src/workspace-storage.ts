import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { createStorage, type Draft, type DraftStorage } from './platform';
import { createRecoveryJournal, mergeRecoveryDrafts, type RecoveryJournal } from './recovery-journal';
import { addDailyWords, createWorkspaceApi, emptyWorkspace, runWorkspaceOperation, type WorkspacePersistence, type WorkspaceState } from './workspace-api';

const key = 'inkforge.mobile.workspace.v1';

export function browserWorkspaceStorage(storage: Storage): WorkspacePersistence {
  return {
    async read() {
      const value = storage.getItem(key);
      return value ? JSON.parse(value) as WorkspaceState : emptyWorkspace();
    },
    async write(state) { storage.setItem(key, JSON.stringify(state)); },
  };
}

/** Import the validation prototype once; keep its source data intact. */
export async function importPrototype(storage: WorkspacePersistence, prototype: DraftStorage): Promise<void> {
  const state = await storage.read();
  if (state.prototypeImported) return;
  const books = await prototype.loadBooks();
  for (const book of books) {
    if (state.projects.some(item => item.id === book.id)) continue;
    state.projects.push({
      id: book.id, name: book.title, path: '', createdAt: new Date(book.updatedAt).toISOString(),
      dailyGoal: 2000, lastOpened: null, synopsis: '', genre: '', subGenre: '', tags: [],
      masterOutline: '', preRefineMasterOutline: null, globalWorldview: '',
    });
    const drafts = await prototype.loadDrafts(book.id);
    drafts.forEach((draft, order) => {
      if (state.chapters.some(item => item.record.id === draft.id)) return;
      state.chapters.push({
        record: {
          id: draft.id, projectId: book.id, parentId: null, title: draft.title, order,
          status: 'draft', wordCount: Array.from(draft.text.replace(/\s/g, '')).length,
          filePath: '', updatedAt: new Date(draft.updatedAt).toISOString(),
        },
        content: draft.text, deleted: false,
      });
    });
  }
  state.prototypeImported = true;
  await storage.write(state);
}

let opening: Promise<WorkspacePersistence> | undefined;

export function openWorkspaceStorage(): Promise<WorkspacePersistence> {
  if (opening) return opening;
  opening = (async () => {
    let storage: WorkspacePersistence;
    if (!Capacitor.isNativePlatform()) {
      storage = browserWorkspaceStorage(localStorage);
    } else {
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const db = await sqlite.createConnection('inkforge_mobile_workspace', false, 'no-encryption', 1, false);
      await db.open();
      await db.execute('CREATE TABLE IF NOT EXISTS workspace_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)');
      storage = {
        async read() {
          const result = await db.query('SELECT payload FROM workspace_state WHERE id = 1');
          return result.values?.length ? JSON.parse(result.values[0].payload) as WorkspaceState : emptyWorkspace();
        },
        async write(state) {
          // One atomic SQLite statement commits metadata and正文 together.
          await db.run('INSERT INTO workspace_state (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [JSON.stringify(state)]);
        },
      };
    }
    await importPrototype(storage, await createStorage());
    return storage;
  })().catch(error => { opening = undefined; throw error; });
  return opening;
}

/** Keep the validation screen using the same durable workspace as shared UI. */
export async function openWorkspaceDraftStorage(): Promise<DraftStorage> {
  const storage = await openWorkspaceStorage();
  return workspaceDraftStorage(storage);
}

export function workspaceDraftStorage(
  storage: WorkspacePersistence,
  journal: RecoveryJournal = createRecoveryJournal(),
): DraftStorage {
  const api = createWorkspaceApi(storage);
  const saveDraft = async (draft: Draft) => {
    await runWorkspaceOperation(storage, state => {
      const existing = state.chapters.find(item => item.record.id === draft.id);
      if (!state.projects.some(item => item.id === draft.bookId)) throw new Error('作品不存在');
      const wordCount = Array.from(draft.text.replace(/\s/g, '')).length;
      addDailyWords(state, draft.bookId, wordCount - (existing?.record.wordCount ?? 0));
      if (existing) {
        existing.content = draft.text;
        existing.record.title = draft.title;
        existing.record.updatedAt = new Date(draft.updatedAt).toISOString();
        existing.record.wordCount = wordCount;
      } else {
        state.chapters.push({ record: {
          id: draft.id, projectId: draft.bookId, parentId: null, title: draft.title,
          order: state.chapters.filter(item => item.record.projectId === draft.bookId).length,
          status: 'draft', wordCount,
          filePath: '', updatedAt: new Date(draft.updatedAt).toISOString(),
        }, content: draft.text, deleted: false });
      }
    }, true);
  };
  return {
    async loadBooks() {
      return (await api.project.list()).map(project => ({
        id: project.id, title: project.name, updatedAt: Date.parse(project.lastOpened ?? project.createdAt),
      }));
    },
    async loadDrafts(bookId) {
      const records = await api.chapter.list({ projectId: bookId });
      const persisted = await Promise.all(records.map(async record => ({
        id: record.id, bookId: record.projectId, title: record.title,
        text: (await api.chapter.read({ id: record.id })).content,
        updatedAt: Date.parse(record.updatedAt ?? new Date(0).toISOString()),
      })));
      const recovered = journal.read().drafts.filter(draft => draft.bookId === bookId);
      const result = await mergeRecoveryDrafts(persisted, recovered, saveDraft, journal.clear);
      return result.drafts;
    },
    async saveBook(book) {
      // Prototype IDs must survive migration and recovery-journal replay.
      await runWorkspaceOperation(storage, state => {
        const existing = state.projects.find(item => item.id === book.id);
        if (existing) { existing.name = book.title; return; }
        state.projects.push({
          id: book.id, name: book.title, path: '', createdAt: new Date(book.updatedAt).toISOString(),
          dailyGoal: 2000, lastOpened: null, synopsis: '', genre: '', subGenre: '', tags: [],
          masterOutline: '', preRefineMasterOutline: null, globalWorldview: '',
        });
      }, true);
    },
    save: saveDraft,
  };
}
