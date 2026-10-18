import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

export interface Draft {
  id: string;
  bookId: string;
  title: string;
  text: string;
  updatedAt: number;
}

export interface Book {
  id: string;
  title: string;
  updatedAt: number;
}

export interface DraftStorage {
  loadBooks(): Promise<Book[]>;
  loadDrafts(bookId: string): Promise<Draft[]>;
  saveBook(book: Book): Promise<void>;
  save(draft: Draft): Promise<void>;
}

interface NativeCredentialPlugin {
  get(): Promise<{ value: string }>;
  save(options: { value: string }): Promise<void>;
  clear(): Promise<void>;
  getSyncToken(): Promise<{ value: string }>;
  saveSyncToken(options: { value: string }): Promise<void>;
  clearSyncToken(): Promise<void>;
}

const nativeCredentialPlugin = registerPlugin<NativeCredentialPlugin>('SecureCredential');

export const capabilities = Object.freeze({
  nativeSQLite: Capacitor.getPlatform() === 'android',
  terminal: false,
  lanSync: Capacitor.getPlatform() === 'android',
  persistentCredentials: false,
});

export async function loadSavedApiKey(): Promise<string> {
  if (!capabilities.nativeSQLite) return '';
  return (await nativeCredentialPlugin.get()).value;
}

export async function saveApiKey(value: string): Promise<void> {
  if (!capabilities.nativeSQLite) return;
  await nativeCredentialPlugin.save({ value });
}

export async function clearApiKey(): Promise<void> {
  if (!capabilities.nativeSQLite) return;
  await nativeCredentialPlugin.clear();
}
export async function loadSyncToken(): Promise<string> {
  if (!capabilities.lanSync) return '';
  return (await nativeCredentialPlugin.getSyncToken()).value;
}

export async function saveSyncToken(value: string): Promise<void> {
  if (!capabilities.lanSync) throw new Error('安全同步凭据仅在 Android 原生版本可用');
  await nativeCredentialPlugin.saveSyncToken({ value });
}

export async function clearSyncToken(): Promise<void> {
  if (!capabilities.lanSync) return;
  await nativeCredentialPlugin.clearSyncToken();
}


// Web preview is explicitly separate from the Android SQLite implementation.
export function browserStorage(storage: Storage): DraftStorage {
  const booksKey = 'inkforge.mobile.books';
  const chaptersKey = 'inkforge.mobile.chapters';
  const legacyKey = 'inkforge.mobile.validation.drafts';
  const readBooks = (): Book[] => JSON.parse(storage.getItem(booksKey) ?? '[]') as Book[];
  const readDrafts = (): Draft[] => JSON.parse(storage.getItem(chaptersKey) ?? '[]') as Draft[];
  const ensureLegacyImported = () => {
    if (!storage.getItem(legacyKey)) return;
    const legacy = JSON.parse(storage.getItem(legacyKey) ?? '[]') as Omit<Draft, 'bookId'>[];
    if (!legacy.length) { storage.removeItem(legacyKey); return; }
    const book: Book = { id: 'book-local', title: '我的书稿', updatedAt: Date.now() };
    const books = readBooks();
    const drafts = readDrafts();
    if (!books.some(item => item.id === book.id)) storage.setItem(booksKey, JSON.stringify([...books, book]));
    storage.setItem(chaptersKey, JSON.stringify([
      ...drafts,
      ...legacy.filter(item => !drafts.some(chapter => chapter.id === item.id)).map(item => ({ ...item, bookId: book.id })),
    ]));
    storage.removeItem(legacyKey);
  };
  return {
    async loadBooks() { ensureLegacyImported(); return readBooks(); },
    async loadDrafts(bookId) { ensureLegacyImported(); return readDrafts().filter(draft => draft.bookId === bookId).sort((a, b) => a.updatedAt - b.updatedAt); },
    async saveBook(book) {
      const books = readBooks();
      storage.setItem(booksKey, JSON.stringify([...books.filter(item => item.id !== book.id), book]));
    },
    async save(draft) {
      const drafts = readDrafts();
      storage.setItem(chaptersKey, JSON.stringify([...drafts.filter(item => item.id !== draft.id), draft]));
    },
  };
}

export async function createStorage(): Promise<DraftStorage> {
  if (!Capacitor.isNativePlatform()) return browserStorage(localStorage);
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await sqlite.createConnection('inkforge_mobile_validation', false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      book_id TEXT NOT NULL DEFAULT 'book-local' REFERENCES books(id) ON DELETE CASCADE
    );
  `);
  const columns = await db.query('PRAGMA table_info(drafts)');
  if (!(columns.values ?? []).some(column => column.name === 'book_id')) {
    await db.execute("ALTER TABLE drafts ADD COLUMN book_id TEXT NOT NULL DEFAULT 'book-local'");
  }
  const legacy = await db.query("SELECT id FROM drafts WHERE book_id = 'book-local' LIMIT 1");
  if (legacy.values?.length) {
    await db.run("INSERT OR IGNORE INTO books (id, title, updated_at) VALUES ('book-local', '我的书稿', ?)", [Date.now()]);
  }
  return {
    async loadBooks() {
      const result = await db.query('SELECT id, title, updated_at AS updatedAt FROM books ORDER BY updated_at DESC');
      return (result.values ?? []) as Book[];
    },
    async loadDrafts(bookId) {
      const result = await db.query('SELECT id, book_id AS bookId, title, text, updated_at AS updatedAt FROM drafts WHERE book_id = ? ORDER BY updated_at ASC', [bookId]);
      return (result.values ?? []) as Draft[];
    },
    async saveBook(book) {
      await db.run('INSERT INTO books (id, title, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at',
        [book.id, book.title, book.updatedAt]);
    },
    async save(draft) {
      await db.run('INSERT INTO drafts (id, book_id, title, text, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id, title=excluded.title, text=excluded.text, updated_at=excluded.updated_at',
        [draft.id, draft.bookId, draft.title, draft.text, draft.updatedAt]);
    },
  };
}
