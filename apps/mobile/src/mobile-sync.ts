import {
  mobileSyncChapterKey,
  mobileSyncChapterVersion,
  mobileSyncProjectKey,
  mobileSyncProjectVersion,
  type ChapterRecord,
  type MobileSyncChapter,
  type MobileSyncConflict,
  type MobileSyncProject,
  type MobileSyncRequest,
  type MobileSyncResponse,
  type MobileSyncSnapshot,
  type ProjectRecord,
} from '@inkforge/shared';
import { runWorkspaceOperation, type MobileSyncPreferences, type WorkspacePersistence, type WorkspaceState } from './workspace-api';

export interface MobileSyncPairResult {
  endpoint: string;
  deviceId: string;
  token: string;
}

export interface MobileSyncRunResult {
  conflicts: MobileSyncConflict[];
  syncedAt: string;
  projectCount: number;
  chapterCount: number;
}

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeMobileSyncEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('请输入桌面端显示的 Tailscale HTTPS 地址。'); }
  if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.ts.net')) {
    throw new Error('同步地址必须是 Tailscale 的 HTTPS 域名（*.ts.net）。');
  }
  if (url.username || url.password || url.search || url.hash || url.port) {
    throw new Error('同步地址不能包含账号、端口、查询参数或片段。');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && pathname !== '/inkforge') throw new Error('同步地址路径应为 /inkforge。');
  return `${url.origin}/inkforge`;
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number, fetcher: FetchLike): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `桌面同步服务返回 HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接桌面同步服务超时；请确认手机和电脑均已连接 Tailscale。');
    if (error instanceof TypeError) throw new Error('无法连接桌面同步服务；请确认 Tailscale 在线且桌面 InkForge 同步服务正在运行。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function pairMobileSync(
  endpointValue: string,
  codeValue: string,
  deviceName = 'InkForge Android',
  fetcher: FetchLike = fetch,
): Promise<MobileSyncPairResult> {
  const endpoint = normalizeMobileSyncEndpoint(endpointValue);
  const code = codeValue.trim();
  if (!/^\d{6}$/.test(code)) throw new Error('配对码应为 6 位数字。');
  const name = deviceName.trim().slice(0, 60);
  if (!name) throw new Error('设备名称不能为空。');
  const response = await requestJson<unknown>(`${endpoint}/api/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, deviceName: name }),
  }, 15_000, fetcher);
  if (!isRecord(response) || typeof response.deviceId !== 'string' || typeof response.token !== 'string') {
    throw new Error('桌面端返回的配对信息无效。');
  }
  return { endpoint, deviceId: response.deviceId, token: response.token };
}

export async function unpairMobileSync(endpointValue: string, token: string, fetcher: FetchLike = fetch): Promise<void> {
  const endpoint = normalizeMobileSyncEndpoint(endpointValue);
  await requestJson<unknown>(`${endpoint}/api/v1/unpair`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  }, 10_000, fetcher);
}

function projectForSync(project: ProjectRecord): MobileSyncProject {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    dailyGoal: project.dailyGoal,
    synopsis: project.synopsis ?? '',
    genre: project.genre ?? '',
    subGenre: project.subGenre ?? '',
    tags: Array.isArray(project.tags) ? project.tags.filter(tag => typeof tag === 'string') : [],
    masterOutline: project.masterOutline ?? '',
    preRefineMasterOutline: project.preRefineMasterOutline ?? null,
    globalWorldview: project.globalWorldview ?? '',
  };
}

function chapterForSync(item: WorkspaceState['chapters'][number]): MobileSyncChapter {
  const record = item.record;
  return {
    record: {
      id: record.id,
      projectId: record.projectId,
      parentId: record.parentId ?? null,
      title: record.title,
      order: record.order,
      status: record.status,
      wordCount: record.wordCount,
    },
    content: item.content,
    deleted: item.deleted === true,
  };
}

export function buildMobileSyncSnapshot(state: WorkspaceState): MobileSyncSnapshot {
  return {
    projects: state.projects.map(projectForSync),
    chapters: state.chapters.map(chapterForSync),
  };
}

function parseProject(value: unknown): ProjectRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.createdAt !== 'string') {
    throw new Error('桌面同步响应中包含无效作品。');
  }
  if (typeof value.dailyGoal !== 'number' || !Number.isFinite(value.dailyGoal)) throw new Error('桌面同步响应中的作品目标无效。');
  if (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string')) throw new Error('桌面同步响应中的作品标签无效。');
  const stringField = (key: string): string => {
    if (typeof value[key] !== 'string') throw new Error('桌面同步响应中的作品信息不完整。');
    return value[key] as string;
  };
  if (value.preRefineMasterOutline !== null && typeof value.preRefineMasterOutline !== 'string') {
    throw new Error('桌面同步响应中的作品大纲无效。');
  }
  return {
    id: value.id,
    name: value.name,
    path: '',
    createdAt: value.createdAt,
    dailyGoal: value.dailyGoal,
    lastOpened: null,
    synopsis: stringField('synopsis'),
    genre: stringField('genre'),
    subGenre: stringField('subGenre'),
    tags: [...value.tags] as string[],
    masterOutline: stringField('masterOutline'),
    preRefineMasterOutline: value.preRefineMasterOutline as string | null,
    globalWorldview: stringField('globalWorldview'),
  };
}

function parseChapter(value: unknown): WorkspaceState['chapters'][number] {
  if (!isRecord(value) || !isRecord(value.record)) throw new Error('桌面同步响应中包含无效章节。');
  const raw = value.record;
  if (typeof raw.id !== 'string' || typeof raw.projectId !== 'string' || typeof raw.title !== 'string'
    || typeof raw.order !== 'number' || typeof raw.status !== 'string' || typeof raw.wordCount !== 'number'
    || (raw.parentId !== null && typeof raw.parentId !== 'string') || typeof value.content !== 'string'
    || typeof value.deleted !== 'boolean') {
    throw new Error('桌面同步响应中的章节信息不完整。');
  }
  const record: ChapterRecord = {
    id: raw.id,
    projectId: raw.projectId,
    parentId: raw.parentId as string | null,
    title: raw.title,
    order: raw.order,
    status: raw.status,
    wordCount: raw.wordCount,
    filePath: '',
    updatedAt: new Date().toISOString(),
  };
  return { record, content: value.content, deleted: value.deleted };
}

function parseSyncResponse(value: unknown): MobileSyncResponse {
  if (!isRecord(value) || value.format !== 'inkforge.mobile-sync' || value.version !== 1
    || !isRecord(value.snapshot) || !Array.isArray(value.snapshot.projects) || !Array.isArray(value.snapshot.chapters)
    || !isRecord(value.versions) || !Array.isArray(value.conflicts) || typeof value.syncedAt !== 'string') {
    throw new Error('桌面同步响应格式无效，本地书稿未更改。');
  }
  const projects = value.snapshot.projects.map(parseProject);
  const chapters = value.snapshot.chapters.map(parseChapter);
  const projectIds = new Set(projects.map(project => project.id));
  const chapterIds = new Set<string>();
  for (const chapter of chapters) {
    if (!projectIds.has(chapter.record.projectId) || chapterIds.has(chapter.record.id)) {
      throw new Error('桌面同步响应包含重复或孤立章节，本地书稿未更改。');
    }
    chapterIds.add(chapter.record.id);
  }
  const versions: Record<string, string> = {};
  for (const [key, hash] of Object.entries(value.versions)) {
    if (!/^(project|chapter):[A-Za-z0-9._-]{1,128}$/.test(key) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error('桌面同步响应版本信息无效，本地书稿未更改。');
    }
    versions[key] = hash.toLowerCase();
  }
  const conflicts: MobileSyncConflict[] = value.conflicts.map(raw => {
    if (!isRecord(raw) || (raw.kind !== 'project' && raw.kind !== 'chapter')
      || typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.copyId !== 'string') {
      throw new Error('桌面同步冲突信息无效，本地书稿未更改。');
    }
    return { kind: raw.kind, id: raw.id, title: raw.title, copyId: raw.copyId };
  });
  return {
    format: 'inkforge.mobile-sync',
    version: 1,
    snapshot: { projects: projects.map(projectForSync), chapters: chapters.map(chapterForSync) },
    versions,
    conflicts,
    syncedAt: value.syncedAt,
  };
}

export async function synchronizeMobileWorkspace(
  storage: WorkspacePersistence,
  options: { endpoint: string; deviceId: string; token: string },
  fetcher: FetchLike = fetch,
): Promise<MobileSyncRunResult> {
  const endpoint = normalizeMobileSyncEndpoint(options.endpoint);
  if (!options.deviceId || !options.token) throw new Error('请先完成桌面设备配对。');
  return runWorkspaceOperation(storage, async state => {
    const request: MobileSyncRequest = {
      format: 'inkforge.mobile-sync',
      version: 1,
      deviceId: options.deviceId,
      snapshot: buildMobileSyncSnapshot(state),
      baseVersions: state.sync?.baseVersions ?? {},
    };
    const raw = await requestJson<unknown>(`${endpoint}/api/v1/sync`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    }, 60_000, fetcher);
    const response = parseSyncResponse(raw);
    const syncedAt = Date.parse(response.syncedAt);
    state.projects = response.snapshot.projects.map(project => ({ ...project, path: '', lastOpened: null }));
    state.chapters = response.snapshot.chapters.map(chapter => ({
      record: { ...chapter.record, filePath: '', updatedAt: new Date().toISOString() },
      content: chapter.content,
      deleted: chapter.deleted,
    }));
    const preferences: MobileSyncPreferences = {
      endpoint,
      deviceId: options.deviceId,
      baseVersions: response.versions,
      lastSyncedAt: Number.isFinite(syncedAt) ? syncedAt : Date.now(),
    };
    state.sync = preferences;
    return {
      conflicts: response.conflicts,
      syncedAt: response.syncedAt,
      projectCount: state.projects.length,
      chapterCount: state.chapters.filter(chapter => !chapter.deleted).length,
    };
  }, true);
}

export async function saveMobileSyncPreferences(
  storage: WorkspacePersistence,
  preferences: MobileSyncPreferences,
): Promise<void> {
  await runWorkspaceOperation(storage, state => { state.sync = preferences; }, true);
}

export async function clearMobileSyncPreferences(storage: WorkspacePersistence): Promise<void> {
  await runWorkspaceOperation(storage, state => { delete state.sync; }, true);
}

export async function emptyMobileSyncVersions(snapshot: MobileSyncSnapshot): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const project of snapshot.projects) versions[mobileSyncProjectKey(project.id)] = await mobileSyncProjectVersion(project);
  for (const chapter of snapshot.chapters) versions[mobileSyncChapterKey(chapter.record.id)] = await mobileSyncChapterVersion(chapter);
  return versions;
}
