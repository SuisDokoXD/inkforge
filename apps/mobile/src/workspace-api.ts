import type { BookCoverGetResponse, ChapterRecord, ChapterSnapshotRecord, InkforgeApi, ProjectRecord } from '@inkforge/shared';
import type { AdvisorMemory } from './advisor-memory';

export interface MobileSyncPreferences {
  endpoint: string;
  deviceId: string;
  baseVersions: Record<string, string>;
  lastSyncedAt: number | null;
}

export interface WorkspaceState {
  prototypeImported?: boolean;
  covers?: Record<string, BookCoverGetResponse>;
  dailyWords?: Record<string, Record<string, number>>;
  snapshots?: Array<{ record: ChapterSnapshotRecord; content: string }>;
  advisorMemories?: Record<string, AdvisorMemory>;
  projects: ProjectRecord[];
  chapters: Array<{ record: ChapterRecord; content: string; deleted: boolean }>;
  recovery: Record<string, { content: string; savedAt: number }>;
  sync?: MobileSyncPreferences;
}

export interface WorkspacePersistence {
  read(): Promise<WorkspaceState>;
  write(state: WorkspaceState): Promise<void>;
}

export const emptyWorkspace = (): WorkspaceState => ({ projects: [], chapters: [], recovery: {} });

// All adapters sharing a persistence object must share its transaction queue.
const transactions = new WeakMap<WorkspacePersistence, Promise<unknown>>();
export function runWorkspaceOperation<T>(storage: WorkspacePersistence, work: (state: WorkspaceState) => T | Promise<T>, write = false): Promise<T> {
  const pending = (transactions.get(storage) ?? Promise.resolve()).then(async () => {
    const state = await storage.read();
    const result = await work(state);
    if (write) await storage.write(state);
    return result;
  });
  transactions.set(storage, pending.catch(() => undefined));
  return pending;
}

export function addDailyWords(state: WorkspaceState, projectId: string, delta: number): void {
  if (delta <= 0) return;
  const date = new Date();
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  state.dailyWords ??= {};
  state.dailyWords[day] ??= {};
  state.dailyWords[day][projectId] = (state.dailyWords[day][projectId] ?? 0) + delta;
}

/** Serialize read/modify/write operations, including concurrent renderer saves. */
export function createWorkspaceApi(storage: WorkspacePersistence): Pick<InkforgeApi, 'project' | 'chapter' | 'bookshelf' | 'cover'> & { outlineGen: Pick<InkforgeApi['outlineGen'], 'updateProjectMeta'> } {
  const run = <T>(work: (state: WorkspaceState) => T | Promise<T>, write = false): Promise<T> => {
    return runWorkspaceOperation(storage, work, write);
  };
  const project = (state: WorkspaceState, id: string) => {
    const value = state.projects.find(item => item.id === id);
    if (!value) throw new Error('作品不存在');
    return value;
  };
  const chapter = (state: WorkspaceState, id: string, includeTrash = false) => {
    const value = state.chapters.find(item => item.record.id === id && (includeTrash || !item.deleted));
    if (!value) throw new Error('章节不存在');
    return value;
  };
  const newChapter = (state: WorkspaceState, input: Parameters<InkforgeApi['chapter']['create']>[0], content = '') => {
    project(state, input.projectId);
    if (input.parentId && chapter(state, input.parentId).record.projectId !== input.projectId) {
      throw new Error('父章节不属于当前作品');
    }
    const record: ChapterRecord = {
      id: crypto.randomUUID(), projectId: input.projectId, parentId: input.parentId ?? null,
      title: input.title, status: input.status ?? 'draft', wordCount: input.wordCount ?? 0,
      order: input.order ?? state.chapters.filter(item => item.record.projectId === input.projectId).length,
      filePath: '', updatedAt: new Date().toISOString(),
    };
    state.chapters.push({ record, content, deleted: false });
    return record;
  };
  const createChapter: InkforgeApi['chapter']['create'] = input => run(state => newChapter(state, input), true);
  return {
    project: {
      list: () => run(state => state.projects),
      create: input => run(state => {
        if (!input.name.trim()) throw new Error('作品名称不能为空');
        const record: ProjectRecord = {
          id: crypto.randomUUID(), name: input.name.trim(), path: '', createdAt: new Date().toISOString(),
          dailyGoal: input.dailyGoal ?? 2000, lastOpened: null, synopsis: '', genre: '', subGenre: '',
          tags: [], masterOutline: '', preRefineMasterOutline: null, globalWorldview: '',
        };
        state.projects.push(record);
        return record;
      }, true),
      update: input => run(state => {
        const record = project(state, input.id);
        if (input.name !== undefined) {
          if (!input.name.trim()) throw new Error('作品名称不能为空');
          record.name = input.name.trim();
        }
        if (input.dailyGoal !== undefined) record.dailyGoal = input.dailyGoal;
        return record;
      }, true),
      open: input => run(state => {
        const record = project(state, input.id);
        record.lastOpened = new Date().toISOString();
        return record;
      }, true),
      delete: input => run(state => {
        project(state, input.id);
        for (const item of state.chapters.filter(item => item.record.projectId === input.id)) {
          delete state.recovery[item.record.id];
          if (state.advisorMemories) delete state.advisorMemories[item.record.id];
        }
        state.chapters = state.chapters.filter(item => item.record.projectId !== input.id);
        state.projects = state.projects.filter(item => item.id !== input.id);
        if (state.covers) delete state.covers[input.id];
        state.snapshots = state.snapshots?.filter(item => item.record.projectId !== input.id);
        return { id: input.id };
      }, true),
    },
    chapter: {
      create: createChapter,
      list: input => run(state => state.chapters.filter(item => !item.deleted && item.record.projectId === input.projectId)
        .map(item => item.record).sort((a, b) => a.order - b.order)),
      read: input => run(state => {
        const item = chapter(state, input.id);
        return { chapter: item.record, content: item.content };
      }),
      update: input => run(state => {
        const item = chapter(state, input.id);
        if (input.wordCount !== undefined) addDailyWords(state, item.record.projectId, input.wordCount - item.record.wordCount);
        for (const key of ['title', 'status', 'wordCount'] as const) {
          if (input[key] !== undefined) Object.assign(item.record, { [key]: input[key] });
        }
        if (input.content !== undefined) item.content = input.content;
        item.record.updatedAt = new Date().toISOString();
        return item.record;
      }, true),
      delete: input => run(state => { chapter(state, input.id).deleted = true; return { id: input.id }; }, true),
      reorder: input => run(state => {
        const records = input.orderedIds.map(id => chapter(state, id).record);
        if (new Set(input.orderedIds).size !== records.length || records.some(item => item.projectId !== input.projectId)) {
          throw new Error('章节排序包含其他作品或重复章节');
        }
        records.forEach((item, order) => { item.order = order; });
        return records;
      }, true),
      importMd: input => run(state => newChapter(state, {
        ...input, title: input.title ?? '导入章节', filePath: '',
      }, input.content), true),
      exportMd: input => run(state => {
        const item = chapter(state, input.id);
        return { id: input.id, title: item.record.title, fileName: `${item.record.title}.md`, content: item.content };
      }),
      autosaveWrite: input => run(state => {
        chapter(state, input.id);
        const savedAt = Date.now();
        state.recovery[input.id] = { content: input.content, savedAt };
        return { savedAt };
      }, true),
      autosavePeek: input => run(state => {
        const item = chapter(state, input.id);
        const chapterUpdatedAt = item.record.updatedAt ? Date.parse(item.record.updatedAt) : null;
        const recovery = state.recovery[input.id];
        const newer = recovery && recovery.savedAt >= (chapterUpdatedAt ?? 0) && recovery.content !== item.content;
        return { content: newer ? recovery.content : null, savedAt: newer ? recovery.savedAt : null, chapterUpdatedAt };
      }),
      autosaveClear: input => run(state => { delete state.recovery[input.id]; return { ok: true as const }; }, true),
      trashList: input => run(state => state.chapters.filter(item => item.deleted && item.record.projectId === input.projectId).map(item => item.record)),
      trashRestore: input => run(state => { const item = chapter(state, input.id, true); item.deleted = false; return item.record; }, true),
      trashDestroy: input => run(state => {
        const item = chapter(state, input.id, true);
        if (!item.deleted) throw new Error('只能永久删除回收站章节');
        state.chapters = state.chapters.filter(value => value.record.id !== input.id);
        delete state.recovery[input.id];
        state.snapshots = state.snapshots?.filter(item => item.record.chapterId !== input.id);
        if (state.advisorMemories) delete state.advisorMemories[input.id];
        return { id: input.id };
      }, true),
      trashEmpty: input => run(state => {
        const ids = new Set(state.chapters.filter(item => item.deleted && item.record.projectId === input.projectId).map(item => item.record.id));
        state.chapters = state.chapters.filter(item => !ids.has(item.record.id));
        ids.forEach(id => { delete state.recovery[id]; });
        ids.forEach(id => { if (state.advisorMemories) delete state.advisorMemories[id]; });
        state.snapshots = state.snapshots?.filter(item => !ids.has(item.record.chapterId));
        return { count: ids.size };
      }, true),
    },
    bookshelf: {
      listBooks: () => run(state => state.projects.map(project => {
        const chapters = state.chapters.filter(item => !item.deleted && item.record.projectId === project.id);
        const updated = chapters.map(item => item.record.updatedAt).filter((value): value is string => !!value).sort();
        return { project, cover: state.covers?.[project.id]?.cover ?? null,
          chapterCount: chapters.length, totalWords: chapters.reduce((sum, item) => sum + item.record.wordCount, 0),
          todayWords: (() => {
            const date = new Date();
            const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return state.dailyWords?.[day]?.[project.id] ?? 0;
          })(), lastChapterUpdatedAt: updated.at(-1) ?? null,
          originCounts: { manual: chapters.length, 'ai-auto': 0, 'ai-assisted': 0 },
        };
      })),
    },
    cover: {
      get: input => run(state => { project(state, input.projectId); return state.covers?.[input.projectId] ?? { cover: null, base64: null }; }),
      upload: input => run(state => {
        project(state, input.projectId);
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(input.mime) || input.base64.length > 2800000) {
          throw new Error('封面格式不支持或超过 2 MB');
        }
        const cover = { id: crypto.randomUUID(), projectId: input.projectId, filePath: '', mime: input.mime, uploadedAt: new Date().toISOString() };
        state.covers ??= {};
        state.covers[input.projectId] = { cover, base64: input.base64 };
        return { cover };
      }, true),
      delete: input => run(state => { project(state, input.projectId); if (state.covers) delete state.covers[input.projectId]; return { projectId: input.projectId }; }, true),
    },
    outlineGen: {
      updateProjectMeta: input => run(state => {
        const record = project(state, input.projectId);
        for (const key of ['synopsis', 'genre', 'subGenre', 'tags', 'masterOutline', 'globalWorldview'] as const) {
          if (input[key] !== undefined) Object.assign(record, { [key]: input[key] });
        }
        return record;
      }, true),
    },
  };
}
