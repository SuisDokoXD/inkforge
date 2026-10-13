import { describe, expect, it } from 'vitest';
import { createWorkspaceApi, emptyWorkspace, type WorkspacePersistence } from './workspace-api';
import { createSnapshotApi } from './snapshot-api';

function persistence(): WorkspacePersistence {
  let json = JSON.stringify(emptyWorkspace());
  return { read: async () => JSON.parse(json), write: async state => { json = JSON.stringify(state); } };
}

async function setup() {
  const storage = persistence();
  const workspace = createWorkspaceApi(storage);
  const project = await workspace.project.create({ name: '快照测试' });
  const chapter = await workspace.chapter.create({ projectId: project.id, title: '第一章', filePath: '' });
  const snapshot = createSnapshotApi(storage);
  return { storage, workspace, project, chapter, snapshot };
}

describe('Android chapter snapshots', () => {
  it('restores persisted content and preserves the version before restoring', async () => {
    const { storage, workspace, project, chapter, snapshot } = await setup();
    await workspace.chapter.update({ id: chapter.id, content: '最初中文稿', wordCount: 5 });
    const first = await snapshot.create({ chapterId: chapter.id, projectId: project.id, label: '初稿' });
    await workspace.chapter.update({ id: chapter.id, content: '修改稿', wordCount: 3 });
    await workspace.chapter.autosaveWrite({ id: chapter.id, content: '过期恢复稿' });
    const reopened = createSnapshotApi(storage);
    const restored = await reopened.restore({ snapshotId: first.snapshot.id });
    expect(restored.chapterContent).toBe('最初中文稿');
    expect((await workspace.chapter.read({ id: chapter.id })).content).toBe('最初中文稿');
    expect((await reopened.get({ snapshotId: restored.preRestoreSnapshot.id })).content).toBe('修改稿');
    expect((await workspace.chapter.autosavePeek({ id: chapter.id })).content).toBeNull();
    await reopened.restore({ snapshotId: restored.preRestoreSnapshot.id });
    expect((await workspace.chapter.read({ id: chapter.id })).content).toBe('修改稿');
  });

  it('rejects project mismatches and corrupted snapshots without changing正文', async () => {
    const { storage, workspace, project, chapter, snapshot } = await setup();
    await expect(snapshot.create({ chapterId: chapter.id, projectId: 'other' })).rejects.toThrow();
    const first = await snapshot.create({ chapterId: chapter.id, projectId: project.id });
    const state = await storage.read();
    state.snapshots![0].content = '损坏内容';
    await storage.write(state);
    await expect(snapshot.restore({ snapshotId: first.snapshot.id })).rejects.toThrow('校验失败');
    expect((await workspace.chapter.read({ id: chapter.id })).content).toBe('');
    expect(await snapshot.list({ chapterId: chapter.id })).toHaveLength(1);
  });

  it('commits backup and restore atomically and cleans snapshots on permanent deletion', async () => {
    const { storage, workspace, project, chapter, snapshot } = await setup();
    const first = await snapshot.create({ chapterId: chapter.id, projectId: project.id });
    await workspace.chapter.update({ id: chapter.id, content: '保留当前稿' });
    const failed = createSnapshotApi({ read: storage.read, write: async () => { throw new Error('disk full'); } });
    await expect(failed.restore({ snapshotId: first.snapshot.id })).rejects.toThrow('disk full');
    expect((await workspace.chapter.read({ id: chapter.id })).content).toBe('保留当前稿');
    expect(await snapshot.list({ chapterId: chapter.id })).toHaveLength(1);
    await workspace.chapter.delete({ id: chapter.id });
    await workspace.chapter.trashDestroy({ id: chapter.id });
    await expect(snapshot.get({ snapshotId: first.snapshot.id })).rejects.toThrow();
  });

  it('keeps 50 automatic backups while preserving manual ones', async () => {
    const { project, chapter, snapshot } = await setup();
    const manual = await snapshot.create({ chapterId: chapter.id, projectId: project.id });
    for (let i = 0; i < 51; i += 1) await snapshot.create({ chapterId: chapter.id, projectId: project.id, kind: 'auto-periodic' });
    const list = await snapshot.list({ chapterId: chapter.id, limit: 100 });
    expect(list.filter(item => item.kind !== 'manual')).toHaveLength(50);
    expect(list.find(item => item.id === manual.snapshot.id)).toBeDefined();
  });
});
