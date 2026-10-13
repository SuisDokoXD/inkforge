import { describe, expect, it } from 'vitest';
import { createWorkspaceApi, emptyWorkspace, type WorkspacePersistence } from './workspace-api';

function persistence(): WorkspacePersistence {
  let json = JSON.stringify(emptyWorkspace());
  return { read: async () => JSON.parse(json), write: async state => { json = JSON.stringify(state); } };
}

describe('shared renderer mobile workspace API', () => {
  it('preserves concurrent saves, project isolation and content after reopening', async () => {
    const store = persistence();
    const api = createWorkspaceApi(store);
    const [one, two] = await Promise.all([api.project.create({ name: '书一' }), api.project.create({ name: '书二' })]);
    const [a, b] = await Promise.all([
      api.chapter.create({ projectId: one.id, title: '甲', filePath: '' }),
      api.chapter.create({ projectId: two.id, title: '乙', filePath: '' }),
    ]);
    await Promise.all([
      api.chapter.update({ id: a.id, content: '<p>中文正文</p>' }),
      api.chapter.update({ id: b.id, content: '另一部书' }),
    ]);
    const reopened = createWorkspaceApi(store);
    expect((await reopened.project.list())).toHaveLength(2);
    expect((await reopened.chapter.list({ projectId: one.id })).map(item => item.id)).toEqual([a.id]);
    expect((await reopened.chapter.read({ id: a.id })).content).toBe('<p>中文正文</p>');
    await expect(api.chapter.reorder({ projectId: one.id, orderedIds: [b.id] })).rejects.toThrow();
  });

  it('restores independent recovery content and safely manages trash', async () => {
    const store = persistence();
    const api = createWorkspaceApi(store);
    const book = await api.project.create({ name: '书' });
    const chapter = await api.chapter.create({ projectId: book.id, title: '章', filePath: '' });
    await api.chapter.autosaveWrite({ id: chapter.id, content: '未提交恢复稿' });
    expect((await createWorkspaceApi(store).chapter.autosavePeek({ id: chapter.id })).content).toBe('未提交恢复稿');
    await expect(api.chapter.trashDestroy({ id: chapter.id })).rejects.toThrow();
    await api.chapter.delete({ id: chapter.id });
    expect(await api.chapter.list({ projectId: book.id })).toEqual([]);
    await api.chapter.trashRestore({ id: chapter.id });
    expect(await api.chapter.list({ projectId: book.id })).toHaveLength(1);
    await api.project.delete({ id: book.id });
    expect((await store.read()).recovery).toEqual({});
  });

  it('propagates save failures and permits retry without corrupting committed data', async () => {
    const backing = persistence();
    let fail = false;
    const api = createWorkspaceApi({ read: backing.read, write: async state => {
      if (fail) throw new Error('disk full');
      await backing.write(state);
    } });
    const book = await api.project.create({ name: '原名' });
    fail = true;
    await expect(api.project.update({ id: book.id, name: '未保存' })).rejects.toThrow('disk full');
    expect((await api.project.list())[0].name).toBe('原名');
    fail = false;
    await api.project.update({ id: book.id, name: '重试成功' });
    expect((await api.project.list())[0].name).toBe('重试成功');
  });

  it('imports chapter metadata and content in one commit', async () => {
    const backing = persistence();
    let writes = 0;
    let fail = false;
    const api = createWorkspaceApi({ read: backing.read, write: async state => {
      writes += 1;
      if (fail) throw new Error('disk full');
      await backing.write(state);
    } });
    const book = await api.project.create({ name: '导入' });
    writes = 0;
    const chapter = await api.chapter.importMd({ projectId: book.id, content: '# 完整正文' });
    expect(writes).toBe(1);
    expect((await api.chapter.read({ id: chapter.id })).content).toBe('# 完整正文');
    fail = true;
    await expect(api.chapter.importMd({ projectId: book.id, content: '失败正文' })).rejects.toThrow();
    expect(await api.chapter.list({ projectId: book.id })).toHaveLength(1);
  });

  it('persists book settings, covers and bookshelf counts across reopening', async () => {
    const store = persistence();
    const api = createWorkspaceApi(store);
    const book = await api.project.create({ name: '农村生活' });
    const chapter = await api.chapter.create({ projectId: book.id, title: '春天', filePath: '' });
    await api.outlineGen.updateProjectMeta({ projectId: book.id, globalWorldview: '1990 年代北方农村', tags: ['乡村'] });
    await api.cover.upload({ projectId: book.id, fileName: 'cover.png', mime: 'image/png', base64: 'aW1hZ2U=' });
    await api.chapter.update({ id: chapter.id, wordCount: 218, content: '正文' });
    await api.chapter.update({ id: chapter.id, wordCount: 218, content: '重复保存' });
    const reopened = createWorkspaceApi(store);
    const [summary] = await reopened.bookshelf.listBooks();
    expect(summary.project.globalWorldview).toBe('1990 年代北方农村');
    expect(summary.project.tags).toEqual(['乡村']);
    expect(summary.chapterCount).toBe(1);
    expect(summary.totalWords).toBe(218);
    expect(summary.todayWords).toBe(218);
    expect((await reopened.cover.get({ projectId: book.id })).base64).toBe('aW1hZ2U=');
  });
});
