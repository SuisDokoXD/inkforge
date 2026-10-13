import { runWorkspaceOperation, type WorkspacePersistence } from './workspace-api';

export interface AdvisorTurn {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}
export interface AdvisorMemory { summary: string; turns: AdvisorTurn[] }
export const emptyAdvisorMemory = (): AdvisorMemory => ({ summary: '', turns: [] });

/** Bounded context; older exchanges remain available locally. */
export function advisorContext(memory: AdvisorMemory): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (memory.summary.trim()) messages.push({ role: 'user', content: `作者确认的章节背景：\n${memory.summary.slice(0, 2000)}` });
  for (const turn of memory.turns.slice(-4)) {
    messages.push({ role: 'user', content: turn.question.slice(0, 1000) });
    messages.push({ role: 'assistant', content: turn.answer.slice(0, 2000) });
  }
  return messages;
}

export function createAdvisorMemoryApi(storage: WorkspacePersistence) {
  const requireChapter = (state: Awaited<ReturnType<WorkspacePersistence['read']>>, chapterId: string) => {
    if (!state.chapters.some(item => item.record.id === chapterId && !item.deleted)) throw new Error('章节不存在');
  };
  return {
    get: (chapterId: string) => runWorkspaceOperation(storage, state => {
      requireChapter(state, chapterId);
      return state.advisorMemories?.[chapterId] ?? emptyAdvisorMemory();
    }),
    setSummary: (chapterId: string, summary: string) => runWorkspaceOperation(storage, state => {
      requireChapter(state, chapterId);
      if (summary.length > 2000) throw new Error('章节背景最多 2000 字');
      state.advisorMemories ??= {};
      const memory = state.advisorMemories[chapterId] ?? emptyAdvisorMemory();
      memory.summary = summary;
      state.advisorMemories[chapterId] = memory;
      return memory;
    }, true),
    append: (chapterId: string, question: string, answer: string) => runWorkspaceOperation(storage, state => {
      requireChapter(state, chapterId);
      if (!answer.trim()) throw new Error('不能保存空建议');
      if (question.length > 10000 || answer.length > 30000) throw new Error('对话超出保存长度');
      state.advisorMemories ??= {};
      const memory = state.advisorMemories[chapterId] ?? emptyAdvisorMemory();
      memory.turns.push({ id: crypto.randomUUID(), question, answer, createdAt: new Date().toISOString() });
      state.advisorMemories[chapterId] = memory;
      return memory;
    }, true),
    clear: (chapterId: string) => runWorkspaceOperation(storage, state => {
      requireChapter(state, chapterId);
      if (state.advisorMemories) delete state.advisorMemories[chapterId];
      return emptyAdvisorMemory();
    }, true),
  };
}
