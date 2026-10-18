import { describe, expect, it, vi } from 'vitest';
import {
  mobileSyncChapterVersion,
  mobileSyncProjectVersion,
  type MobileSyncChapter,
  type MobileSyncProject,
  type MobileSyncResponse,
} from '@inkforge/shared';
import { emptyWorkspace, type WorkspacePersistence, type WorkspaceState } from './workspace-api';
import {
  buildMobileSyncSnapshot,
  normalizeMobileSyncEndpoint,
  pairMobileSync,
  synchronizeMobileWorkspace,
} from './mobile-sync';

function makeProject(): MobileSyncProject {
  return {
    id: 'book-local', name: '本地作品', createdAt: '2026-01-01T00:00:00.000Z', dailyGoal: 2000,
    synopsis: '', genre: '', subGenre: '', tags: [], masterOutline: '', preRefineMasterOutline: null, globalWorldview: '',
  };
}

function makeChapter(content = '手机正文'): MobileSyncChapter {
  return {
    record: { id: 'chapter-local', projectId: 'book-local', parentId: null, title: '第一章', order: 0, status: 'draft', wordCount: 4 },
    content,
    deleted: false,
  };
}

function fakeStorage(initial: WorkspaceState): { storage: WorkspacePersistence; read: () => WorkspaceState; writes: () => number } {
  let state = structuredClone(initial);
  let writeCount = 0;
  return {
    storage: {
      async read() { return structuredClone(state); },
      async write(next) { state = structuredClone(next); writeCount += 1; },
    },
    read: () => structuredClone(state),
    writes: () => writeCount,
  };
}

describe('Tailnet mobile sync client', () => {
  it('accepts only HTTPS Tailscale host URLs and normalizes the app path', () => {
    expect(normalizeMobileSyncEndpoint(' https://laptop.tail123.ts.net/inkforge/ ')).toBe('https://laptop.tail123.ts.net/inkforge');
    expect(normalizeMobileSyncEndpoint('https://laptop.tail123.ts.net')).toBe('https://laptop.tail123.ts.net/inkforge');
    expect(() => normalizeMobileSyncEndpoint('http://laptop.tail123.ts.net/inkforge')).toThrow(/HTTPS/);
    expect(() => normalizeMobileSyncEndpoint('https://example.com/inkforge')).toThrow(/Tailscale/);
    expect(() => normalizeMobileSyncEndpoint('https://laptop.tail123.ts.net/other')).toThrow('/inkforge');
    expect(() => normalizeMobileSyncEndpoint('https://user@laptop.tail123.ts.net/inkforge')).toThrow(/账号/);
  });

  it('pairs by HTTPS URL and sends only the code and device label', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(
      JSON.stringify({ deviceId: 'android-1', token: 'x'.repeat(43) }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const paired = await pairMobileSync('https://laptop.tail123.ts.net/inkforge', '123456', 'InkForge Android', fetcher);
    expect(paired).toEqual({ endpoint: 'https://laptop.tail123.ts.net/inkforge', deviceId: 'android-1', token: 'x'.repeat(43) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://laptop.tail123.ts.net/inkforge/api/v1/pair');
    expect(JSON.parse(String(init?.body))).toEqual({ code: '123456', deviceName: 'InkForge Android' });
    await expect(pairMobileSync('https://laptop.tail123.ts.net/inkforge', '12')).rejects.toThrow(/6 位/);
  });

  it('never serializes desktop paths and applies a validated canonical response', async () => {
    const local = emptyWorkspace();
    local.projects.push({
      ...makeProject(), path: 'C:\\private\\novel', lastOpened: null,
    });
    local.chapters.push({
      record: { ...makeChapter().record, filePath: 'C:\\private\\chapter.md', updatedAt: '2026-01-01T00:00:00.000Z' },
      content: '手机正文', deleted: false,
    });
    local.advisorMemories = { 'chapter-local': { summary: 'local only', turns: [] } as never };
    const persistence = fakeStorage(local);

    const project = makeProject();
    const desktopChapter = makeChapter('桌面正文');
    const versions = {
      'project:book-local': await mobileSyncProjectVersion(project),
      'chapter:chapter-local': await mobileSyncChapterVersion(desktopChapter),
    };
    const response: MobileSyncResponse = {
      format: 'inkforge.mobile-sync', version: 1,
      snapshot: { projects: [project], chapters: [desktopChapter] },
      versions,
      conflicts: [],
      syncedAt: '2026-05-01T00:00:00.000Z',
    };
    let body = '';
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await synchronizeMobileWorkspace(persistence.storage, {
      endpoint: 'https://laptop.tail123.ts.net/inkforge', deviceId: 'android-1', token: 'token',
    }, fetcher);

    const request = JSON.parse(body) as { snapshot: { projects: Array<Record<string, unknown>>; chapters: Array<{ record: Record<string, unknown> }> } };
    expect(request.snapshot.projects[0]).not.toHaveProperty('path');
    expect(request.snapshot.chapters[0].record).not.toHaveProperty('filePath');
    expect(request.snapshot.chapters[0].record).not.toHaveProperty('updatedAt');
    expect(result.chapterCount).toBe(1);
    expect(persistence.read().chapters[0].content).toBe('桌面正文');
    expect(persistence.read().projects[0].path).toBe('');
    expect(persistence.read().chapters[0].record.filePath).toBe('');
    expect(persistence.read().advisorMemories?.['chapter-local']?.summary).toBe('local only');
    expect(persistence.read().sync?.baseVersions).toEqual(versions);
    expect(persistence.writes()).toBe(1);
  });

  it('keeps local state unchanged when a sync request fails', async () => {
    const local = emptyWorkspace();
    local.projects.push({ ...makeProject(), path: '', lastOpened: null });
    const persistence = fakeStorage(local);
    const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); });

    await expect(synchronizeMobileWorkspace(persistence.storage, {
      endpoint: 'https://laptop.tail123.ts.net/inkforge', deviceId: 'android-1', token: 'token',
    }, fetcher)).rejects.toThrow(/无法连接/);

    expect(persistence.writes()).toBe(0);
    expect(persistence.read().projects).toHaveLength(1);
    expect(persistence.read().sync).toBeUndefined();
  });
});
