import type { ChapterSnapshotRecord, InkforgeApi, SnapshotCreateInput } from '@inkforge/shared';
import { runWorkspaceOperation, type WorkspacePersistence, type WorkspaceState } from './workspace-api';

async function hash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createSnapshotApi(storage: WorkspacePersistence): InkforgeApi['snapshot'] {
  const chapter = (state: WorkspaceState, id: string) => {
    const item = state.chapters.find(item => item.record.id === id && !item.deleted);
    if (!item) throw new Error('章节不存在或已在回收站');
    return item;
  };
  const snapshot = (state: WorkspaceState, id: string) => {
    const item = state.snapshots?.find(item => item.record.id === id);
    if (!item) throw new Error('版本备份不存在');
    return item;
  };
  const create = async (state: WorkspaceState, input: SnapshotCreateInput): Promise<ChapterSnapshotRecord> => {
    const item = chapter(state, input.chapterId);
    if (item.record.projectId !== input.projectId) throw new Error('章节不属于指定作品');
    const record: ChapterSnapshotRecord = {
      id: crypto.randomUUID(), chapterId: input.chapterId, projectId: input.projectId,
      kind: input.kind ?? 'manual', label: input.label ?? null,
      contentHash: await hash(item.content), filePath: '', wordCount: item.record.wordCount,
      runId: input.runId ?? null, agentRole: input.agentRole ?? null,
      sourceMessageId: input.sourceMessageId ?? null, createdAt: new Date().toISOString(),
    };
    state.snapshots ??= [];
    state.snapshots.push({ record, content: item.content });
    const retainedAuto = new Set(state.snapshots.filter(value => value.record.chapterId === input.chapterId && value.record.kind !== 'manual')
      .slice(-50).map(value => value.record.id));
    state.snapshots = state.snapshots.filter(value => value.record.chapterId !== input.chapterId
      || value.record.kind === 'manual' || retainedAuto.has(value.record.id));
    return record;
  };
  return {
    create: input => runWorkspaceOperation(storage, async state => ({ snapshot: await create(state, input) }), true),
    list: input => runWorkspaceOperation(storage, state => {
      chapter(state, input.chapterId);
      return (state.snapshots ?? []).filter(item => item.record.chapterId === input.chapterId
        && (!input.kinds || input.kinds.includes(item.record.kind))
        && (!input.runId || input.runId === item.record.runId))
        .reverse().slice(0, Math.min(500, Math.max(0, input.limit ?? 50))).map(item => item.record);
    }),
    get: input => runWorkspaceOperation(storage, state => {
      const item = snapshot(state, input.snapshotId);
      return { snapshot: item.record, content: item.content };
    }),
    restore: input => runWorkspaceOperation(storage, async state => {
      const selected = snapshot(state, input.snapshotId);
      const item = chapter(state, selected.record.chapterId);
      if (await hash(selected.content) !== selected.record.contentHash) throw new Error('版本备份校验失败，未修改正文');
      const preRestoreSnapshot = await create(state, { chapterId: item.record.id, projectId: item.record.projectId, kind: 'pre-restore' });
      item.content = selected.content;
      item.record.wordCount = selected.record.wordCount;
      item.record.updatedAt = new Date().toISOString();
      delete state.recovery[item.record.id];
      return { restored: selected.record, preRestoreSnapshot, chapterContent: selected.content };
    }, true),
    delete: input => runWorkspaceOperation(storage, state => {
      snapshot(state, input.snapshotId);
      state.snapshots = state.snapshots?.filter(item => item.record.id !== input.snapshotId);
      return { snapshotId: input.snapshotId };
    }, true),
  };
}
