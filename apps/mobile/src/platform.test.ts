import { describe, expect, it } from 'vitest';
import { browserStorage } from './platform';

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: key => { entries.delete(key); },
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  };
}

describe('mobile browser storage', () => {
  it('migrates validation drafts into a local book without losing text', async () => {
    const storage = memoryStorage();
    storage.setItem('inkforge.mobile.validation.drafts', JSON.stringify([
      { id: 'chapter-1', title: '第一章', text: '旧稿内容', updatedAt: 42 },
    ]));

    const repository = browserStorage(storage);
    const books = await repository.loadBooks();
    const chapters = await repository.loadDrafts(books[0].id);

    expect(books).toEqual([{ id: 'book-local', title: '我的书稿', updatedAt: expect.any(Number) }]);
    expect(chapters).toEqual([{ id: 'chapter-1', title: '第一章', text: '旧稿内容', updatedAt: 42, bookId: 'book-local' }]);
    expect(storage.getItem('inkforge.mobile.validation.drafts')).toBeNull();
  });

  it('keeps chapters scoped to their book', async () => {
    const repository = browserStorage(memoryStorage());
    await repository.saveBook({ id: 'one', title: '书一', updatedAt: 1 });
    await repository.saveBook({ id: 'two', title: '书二', updatedAt: 2 });
    await repository.save({ id: 'a', bookId: 'one', title: '第一章', text: 'A', updatedAt: 1 });
    await repository.save({ id: 'b', bookId: 'two', title: '第一章', text: 'B', updatedAt: 1 });

    expect((await repository.loadDrafts('one')).map(chapter => chapter.id)).toEqual(['a']);
    expect((await repository.loadDrafts('two')).map(chapter => chapter.id)).toEqual(['b']);
  });
});
