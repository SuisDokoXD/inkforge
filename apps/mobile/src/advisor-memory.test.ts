import { describe, expect, it } from 'vitest';
import { advisorContext, createAdvisorMemoryApi } from './advisor-memory';
import { createWorkspaceApi, emptyWorkspace, type WorkspacePersistence } from './workspace-api';

async function setup() {
  let json = JSON.stringify(emptyWorkspace());
  const storage: WorkspacePersistence = { read: async () => JSON.parse(json), write: async state => { json = JSON.stringify(state); } };
  const workspace = createWorkspaceApi(storage);
  const project = await workspace.project.create({ name: '书稿' });
  const a = await workspace.chapter.create({ projectId: project.id, title: '甲', filePath: '' });
  const b = await workspace.chapter.create({ projectId: project.id, title: '乙', filePath: '' });
  return { storage, workspace, project, a, b, memory: createAdvisorMemoryApi(storage) };
}

describe('chapter advisor memory', () => {
  it('retains background and conversation after reopening without crossing chapters', async () => {
    const { storage, a, b, memory } = await setup();
    await memory.setSummary(a.id, '1990 年代北方农村');
    await memory.append(a.id, '取水方式？', '请进一步确认当地水井与自来水条件。');
    const reopened = createAdvisorMemoryApi(storage);
    expect((await reopened.get(a.id)).summary).toBe('1990 年代北方农村');
    expect((await reopened.get(a.id)).turns).toHaveLength(1);
    expect((await reopened.get(b.id)).turns).toEqual([]);
    await reopened.clear(a.id);
    expect(await reopened.get(a.id)).toEqual({ summary: '', turns: [] });
  });

  it('bounds request history but keeps all completed exchanges locally', async () => {
    const { a, memory } = await setup();
    await memory.setSummary(a.id, '作者确认背景');
    for (let index = 0; index < 7; index++) await memory.append(a.id, `问题${index}`, '答'.repeat(3000));
    const saved = await memory.get(a.id);
    const context = advisorContext(saved);
    expect(saved.turns).toHaveLength(7);
    expect(context).toHaveLength(9);
    expect(context[1].content).toBe('问题3');
    expect(context[2].content.length).toBe(2000);
    await expect(memory.append(a.id, '问题', '   ')).rejects.toThrow('空建议');
    expect((await memory.get(a.id)).turns).toHaveLength(7);
  });

  it('keeps memory in trash and removes it on permanent chapter or project deletion', async () => {
    const { storage, workspace, project, a, b, memory } = await setup();
    await memory.append(a.id, '甲', '甲建议');
    await memory.append(b.id, '乙', '乙建议');
    await workspace.chapter.delete({ id: a.id });
    await workspace.chapter.trashRestore({ id: a.id });
    expect((await memory.get(a.id)).turns).toHaveLength(1);
    await workspace.chapter.delete({ id: a.id });
    await workspace.chapter.trashDestroy({ id: a.id });
    expect((await storage.read()).advisorMemories?.[a.id]).toBeUndefined();
    await workspace.project.delete({ id: project.id });
    expect((await storage.read()).advisorMemories).toEqual({});
  });
});
