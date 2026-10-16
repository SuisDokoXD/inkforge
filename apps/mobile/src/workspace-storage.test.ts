import { describe, expect, it } from 'vitest';
import { browserStorage } from './platform';
import { createRecoveryJournal } from './recovery-journal';
import { createWorkspaceApi } from './workspace-api';
import { browserWorkspaceStorage, importPrototype, workspaceDraftStorage } from './workspace-storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('prototype migration to shared workspace', () => {
  it('serializes settings and content writes across all adapters sharing storage', async () => {
    const store = browserWorkspaceStorage(memoryStorage());
    const first = createWorkspaceApi(store);
    const second = createWorkspaceApi(store);
    const drafts = workspaceDraftStorage(store);
    const project = await first.project.create({ name: '书稿' });
    await Promise.all([
      drafts.save({ id: 'chapter', bookId: project.id, title: '章', text: '并发正文', updatedAt: Date.now() }),
      first.outlineGen.updateProjectMeta({ projectId: project.id, globalWorldview: '北方农村' }),
      second.project.update({ id: project.id, dailyGoal: 3000 }),
    ]);
    expect((await second.chapter.read({ id: 'chapter' })).content).toBe('并发正文');
    const [book] = await first.project.list();
    expect(book.globalWorldview).toBe('北方农村');
    expect(book.dailyGoal).toBe(3000);
  });

  it('preserves IDs and text, leaves source intact, and does not resurrect deleted projects', async () => {
    const local = memoryStorage();
    const prototype = browserStorage(local);
    await prototype.saveBook({ id: 'book', title: '书稿', updatedAt: 100 });
    await prototype.save({ id: 'chapter', bookId: 'book', title: '章', text: '中文旧稿', updatedAt: 101 });
    const store = browserWorkspaceStorage(local);
    await importPrototype(store, prototype);
    const api = createWorkspaceApi(store);
    expect((await api.chapter.read({ id: 'chapter' })).content).toBe('中文旧稿');
    expect((await prototype.loadDrafts('book'))[0].text).toBe('中文旧稿');
    await api.project.delete({ id: 'book' });
    await importPrototype(store, prototype);
    expect(await api.project.list()).toEqual([]);
  });

  it('replays the latest recovery after restart and retains it when persistence fails', async () => {
    const backing = browserWorkspaceStorage(memoryStorage());
    const project = await createWorkspaceApi(backing).project.create({ name: '恢复测试' });
    const journal = createRecoveryJournal(memoryStorage());
    const drafts = workspaceDraftStorage(backing, journal);
    const persisted = { id: 'chapter', bookId: project.id, title: '第一章', text: '已提交正文', updatedAt: 100 };
    const recovered = { ...persisted, text: '崩溃前最新正文', updatedAt: 200 };
    await drafts.save(persisted);
    journal.write(recovered);

    let shouldFail = true;
    const failingPersistence = {
      read: backing.read,
      write: async (state: Parameters<typeof backing.write>[0]) => {
        if (shouldFail) throw new Error('disk unavailable');
        await backing.write(state);
      },
    };
    const reopenedAfterCrash = workspaceDraftStorage(failingPersistence, journal);
    const visibleRecovery = await reopenedAfterCrash.loadDrafts(project.id);
    expect(visibleRecovery.find(item => item.id === 'chapter')?.text).toBe('崩溃前最新正文');
    expect(journal.read().drafts).toEqual([recovered]);

    shouldFail = false;
    const retryAfterRestart = workspaceDraftStorage(backing, journal);
    expect((await retryAfterRestart.loadDrafts(project.id))[0].text).toBe('崩溃前最新正文');
    expect(journal.read().drafts).toEqual([]);
  });
});
