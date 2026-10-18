import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ensureProjectLayout,
  getProject,
  hasProjectMarker,
  insertChapter,
  insertProject,
  listChapters,
  listProjects,
  listTrashChapters,
  nextChapterFileName,
  readChapterFile,
  restoreChapter,
  sanitizeProjectName,
  softDeleteChapter,
  updateChapter,
  updateProject,
  updateProjectMeta,
  writeChapterFile,
  writeProjectMarker,
  type DB,
} from "@inkforge/storage";
import {
  mobileSyncCanonicalValue,
  mobileSyncChapterKey,
  mobileSyncChapterValue,
  mobileSyncProjectKey,
  mobileSyncProjectValue,
  type ChapterRecord,
  type MobileSyncChapter,
  type MobileSyncConflict,
  type MobileSyncProject,
  type MobileSyncRequest,
  type MobileSyncResponse,
  type MobileSyncSnapshot,
  type ProjectRecord,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/i;
const MAX_PROJECTS = 1_000;
const MAX_CHAPTERS = 20_000;
const MAX_CHAPTER_CONTENT = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} 无效`);
  return value;
}

function boundedString(value: unknown, label: string, max: number, allowEmpty = true): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} 无效或过长`);
  }
  return value;
}

/** Strip local paths, timestamps and unknown client fields before touching storage. */
export function parseMobileSyncRequest(value: unknown, expectedDeviceId: string): MobileSyncRequest {
  if (!isRecord(value) || value.format !== "inkforge.mobile-sync" || value.version !== 1) {
    throw new Error("同步请求格式不受支持");
  }
  const deviceId = safeId(value.deviceId, "设备编号");
  if (deviceId !== expectedDeviceId) throw new Error("配对设备身份不匹配");
  if (!isRecord(value.snapshot) || !Array.isArray(value.snapshot.projects) || !Array.isArray(value.snapshot.chapters)) {
    throw new Error("同步数据结构无效");
  }
  if (value.snapshot.projects.length > MAX_PROJECTS || value.snapshot.chapters.length > MAX_CHAPTERS) {
    throw new Error("作品或章节数量超出同步上限");
  }

  const projectIds = new Set<string>();
  const projects: MobileSyncProject[] = value.snapshot.projects.map((raw): MobileSyncProject => {
    if (!isRecord(raw)) throw new Error("作品数据无效");
    const id = safeId(raw.id, "作品编号");
    if (projectIds.has(id)) throw new Error("同步数据包含重复作品");
    projectIds.add(id);
    const name = boundedString(raw.name, "作品名称", 200, false).trim();
    const dailyGoal = raw.dailyGoal;
    if (typeof dailyGoal !== "number" || !Number.isInteger(dailyGoal) || dailyGoal < 0 || dailyGoal > 100_000) {
      throw new Error("作品每日目标无效");
    }
    if (!Array.isArray(raw.tags) || raw.tags.length > 100 || raw.tags.some(tag => typeof tag !== "string" || tag.length > 200)) {
      throw new Error("作品标签无效");
    }
    if (raw.preRefineMasterOutline !== null && typeof raw.preRefineMasterOutline !== "string") {
      throw new Error("作品大纲快照无效");
    }
    return {
      id,
      name,
      createdAt: boundedString(raw.createdAt, "作品创建时间", 64),
      dailyGoal,
      synopsis: boundedString(raw.synopsis, "作品简介", 200_000),
      genre: boundedString(raw.genre, "作品类型", 200),
      subGenre: boundedString(raw.subGenre, "作品子类型", 200),
      tags: [...raw.tags] as string[],
      masterOutline: boundedString(raw.masterOutline, "作品总纲", 1_000_000),
      preRefineMasterOutline: raw.preRefineMasterOutline === null
        ? null
        : boundedString(raw.preRefineMasterOutline, "作品旧版总纲", 1_000_000),
      globalWorldview: boundedString(raw.globalWorldview, "作品世界观", 1_000_000),
    };
  });

  const chapterIds = new Set<string>();
  const chapters: MobileSyncChapter[] = value.snapshot.chapters.map((raw): MobileSyncChapter => {
    if (!isRecord(raw) || !isRecord(raw.record)) throw new Error("章节数据无效");
    const id = safeId(raw.record.id, "章节编号");
    if (chapterIds.has(id)) throw new Error("同步数据包含重复章节");
    chapterIds.add(id);
    const projectId = safeId(raw.record.projectId, "章节所属作品编号");
    if (!projectIds.has(projectId)) throw new Error("章节所属作品不在同步数据中");
    const parentId = raw.record.parentId === null || raw.record.parentId === undefined
      ? null
      : safeId(raw.record.parentId, "父章节编号");
    const order = raw.record.order;
    const wordCount = raw.record.wordCount;
    if (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 10_000_000) {
      throw new Error("章节排序无效");
    }
    if (typeof wordCount !== "number" || !Number.isInteger(wordCount) || wordCount < 0 || wordCount > 100_000_000) {
      throw new Error("章节字数无效");
    }
    if (typeof raw.deleted !== "boolean") throw new Error("章节回收站状态无效");
    const content = boundedString(raw.content, "章节正文", MAX_CHAPTER_CONTENT);
    return {
      record: {
        id,
        projectId,
        parentId,
        title: boundedString(raw.record.title, "章节标题", 200, false).trim(),
        order,
        status: boundedString(raw.record.status, "章节状态", 80, false),
        wordCount,
      },
      content,
      deleted: raw.deleted,
    };
  });
  const chapterById = new Map(chapters.map(chapter => [chapter.record.id, chapter]));
  for (const chapter of chapters) {
    const parent = chapter.record.parentId ? chapterById.get(chapter.record.parentId) : undefined;
    if (parent && parent.record.projectId !== chapter.record.projectId) throw new Error("父章节属于其他作品");
  }

  if (!isRecord(value.baseVersions) || Object.keys(value.baseVersions).length > MAX_PROJECTS + MAX_CHAPTERS) {
    throw new Error("同步版本记录无效");
  }
  const baseVersions: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, hash] of Object.entries(value.baseVersions)) {
    if (!/^(project|chapter):[A-Za-z0-9._-]{1,128}$/.test(key) || typeof hash !== "string" || !HASH.test(hash)) {
      throw new Error("同步版本记录无效");
    }
    baseVersions[key] = hash.toLowerCase();
  }

  return {
    format: "inkforge.mobile-sync",
    version: 1,
    deviceId,
    snapshot: { projects, chapters },
    baseVersions,
  };
}

function projectDto(project: ProjectRecord): MobileSyncProject {
  const { path: _path, lastOpened: _lastOpened, ...safe } = project;
  return safe;
}

function chapterDto(record: ChapterRecord, content: string, deleted: boolean): MobileSyncChapter {
  const { filePath: _filePath, updatedAt: _updatedAt, ...safe } = record;
  return { record: safe, content, deleted };
}

export function buildDesktopMobileSyncSnapshot(): MobileSyncSnapshot {
  const { db } = getAppContext();
  const projects = listProjects(db);
  const chapters: MobileSyncChapter[] = [];
  for (const project of projects) {
    const active = listChapters(db, project.id).map(record => ({ record, deleted: false }));
    const trash = listTrashChapters(db, project.id).map(record => ({ record, deleted: true }));
    for (const item of [...active, ...trash]) {
      chapters.push(chapterDto(item.record, readChapterFile(project.path, item.record.filePath), item.deleted));
    }
  }
  return {
    projects: projects.map(projectDto),
    chapters,
  };
}

function mobileSyncDigest(value: unknown): string {
  return createHash("sha256").update(mobileSyncCanonicalValue(value), "utf8").digest("hex");
}

function mobileSyncProjectHash(project: MobileSyncProject): string {
  return mobileSyncDigest(mobileSyncProjectValue(project));
}

function mobileSyncChapterHash(chapter: MobileSyncChapter): string {
  return mobileSyncDigest(mobileSyncChapterValue(chapter));
}

export function mobileSyncSnapshotVersions(snapshot: MobileSyncSnapshot): Record<string, string> {
  const versions: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const project of snapshot.projects) versions[mobileSyncProjectKey(project.id)] = mobileSyncProjectHash(project);
  for (const chapter of snapshot.chapters) versions[mobileSyncChapterKey(chapter.record.id)] = mobileSyncChapterHash(chapter);
  return versions;
}

function conflictName(name: string, label: string): string {
  const suffix = `（${label}）`;
  return `${Array.from(name).slice(0, Math.max(1, 120 - Array.from(suffix).length)).join("")}${suffix}`;
}

function applyProject(db: DB, workspaceDir: string, project: MobileSyncProject): ProjectRecord {
  const existing = getProject(db, project.id);
  if (existing) {
    updateProject(db, { id: project.id, name: project.name, dailyGoal: project.dailyGoal });
    return updateProjectMeta(db, {
      id: project.id,
      synopsis: project.synopsis,
      genre: project.genre,
      subGenre: project.subGenre,
      tags: project.tags,
      masterOutline: project.masterOutline,
      preRefineMasterOutline: project.preRefineMasterOutline,
      globalWorldview: project.globalWorldview,
    });
  }

  const safeName = sanitizeProjectName(project.name).slice(0, 80);
  const idSuffix = project.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || randomUUID().slice(0, 12);
  const basePath = path.join(workspaceDir, "projects", `${safeName}-${idSuffix}`);
  let projectPath = basePath;
  let suffix = 2;
  while (fs.existsSync(projectPath) && !hasProjectMarker(projectPath, project.id)) {
    projectPath = `${basePath}-${suffix++}`;
  }
  ensureProjectLayout(projectPath, project.name);
  writeProjectMarker(projectPath, project.id);
  insertProject(db, {
    id: project.id,
    name: project.name,
    path: projectPath,
    dailyGoal: project.dailyGoal,
  });
  return updateProjectMeta(db, {
    id: project.id,
    synopsis: project.synopsis,
    genre: project.genre,
    subGenre: project.subGenre,
    tags: project.tags,
    masterOutline: project.masterOutline,
    preRefineMasterOutline: project.preRefineMasterOutline,
    globalWorldview: project.globalWorldview,
  });
}

function maxChapterOrder(db: DB, projectId: string): number {
  const all = [...listChapters(db, projectId), ...listTrashChapters(db, projectId)];
  return all.reduce((max, chapter) => Math.max(max, chapter.order), -1);
}

function applyChapter(db: DB, input: MobileSyncChapter): void {
  const project = getProject(db, input.record.projectId);
  if (!project) throw new Error("章节所属作品不存在");
  const active = listChapters(db, project.id).find(chapter => chapter.id === input.record.id);
  const trashed = listTrashChapters(db, project.id).find(chapter => chapter.id === input.record.id);
  const previous = active ?? trashed;
  if (previous && previous.projectId !== input.record.projectId) throw new Error("章节编号已被其他作品使用");

  if (!previous) {
    const filePath = nextChapterFileName(project.path, input.record.title);
    writeChapterFile(project.path, filePath, input.content);
    try {
      insertChapter(db, {
        id: input.record.id,
        projectId: project.id,
        parentId: input.record.parentId,
        title: input.record.title,
        order: input.record.order,
        status: input.record.status,
        wordCount: input.record.wordCount,
        filePath,
      });
      if (input.deleted) softDeleteChapter(db, input.record.id);
    } catch (error) {
      try { fs.rmSync(path.join(project.path, filePath), { force: true }); } catch { /* best-effort cleanup */ }
      throw error;
    }
    return;
  }

  if (trashed) restoreChapter(db, input.record.id);
  const current = listChapters(db, project.id).find(chapter => chapter.id === input.record.id);
  if (!current) throw new Error("无法恢复同步章节");
  writeChapterFile(project.path, current.filePath, input.content);
  updateChapter(db, {
    id: current.id,
    title: input.record.title,
    status: input.record.status,
    wordCount: input.record.wordCount,
    filePath: current.filePath,
  });
  db.prepare(`UPDATE chapters SET "order" = ? WHERE id = ? AND project_id = ?`)
    .run(input.record.order, current.id, project.id);
  if (input.deleted) softDeleteChapter(db, current.id);
}

function hasChangesInProject(
  projectId: string,
  chapters: MobileSyncChapter[],
  baseVersions: Record<string, string>,
): boolean {
  for (const chapter of chapters) {
    if (chapter.record.projectId !== projectId) continue;
    const base = baseVersions[mobileSyncChapterKey(chapter.record.id)];
    if (!base || mobileSyncChapterHash(chapter) !== base) return true;
  }
  return false;
}

function currentChapterMap(snapshot: MobileSyncSnapshot): Map<string, MobileSyncChapter> {
  return new Map(snapshot.chapters.map(chapter => [chapter.record.id, chapter]));
}

function makeConflictChapter(input: MobileSyncChapter, id: string, label: string, order: number): MobileSyncChapter {
  return {
    record: {
      ...input.record,
      id,
      title: conflictName(input.record.title, label),
      order,
    },
    content: input.content,
    deleted: input.deleted,
  };
}

/** Three-way synchronization. Unbased data is preserved as a copy rather than overwriting a desktop version. */
// Intentionally has no await: comparisons and writes complete in one main-process turn,
// so an editor IPC save cannot slip between a version check and its apply.
export async function syncMobileWorkspace(value: unknown, expectedDeviceId: string): Promise<MobileSyncResponse> {
  const request = parseMobileSyncRequest(value, expectedDeviceId);
  const ctx = getAppContext();
  const before = buildDesktopMobileSyncSnapshot();
  const serverProjects = new Map(before.projects.map(project => [project.id, project]));
  const serverChapters = currentChapterMap(before);
  const incomingProjectIds = new Set(request.snapshot.projects.map(project => project.id));
  const conflicts: MobileSyncConflict[] = [];
  const branchCopies = new Map<string, string>();

  for (const incoming of request.snapshot.projects) {
    const key = mobileSyncProjectKey(incoming.id);
    const base = request.baseVersions[key];
    const incomingVersion = mobileSyncProjectHash(incoming);
    const current = serverProjects.get(incoming.id);
    if (!current) {
      if (base && incomingVersion === base && !hasChangesInProject(incoming.id, request.snapshot.chapters, request.baseVersions)) {
        applyProject(ctx.db, ctx.workspaceDir, incoming);
        continue;
      }
      if (base) {
        const copyId = randomUUID();
        const copy = { ...incoming, id: copyId, name: conflictName(incoming.name, "本机保留副本") };
        applyProject(ctx.db, ctx.workspaceDir, copy);
        branchCopies.set(incoming.id, copyId);
        conflicts.push({ kind: "project", id: incoming.id, title: incoming.name, copyId });
      } else {
        applyProject(ctx.db, ctx.workspaceDir, incoming);
      }
      continue;
    }

    const currentVersion = mobileSyncProjectHash(current);
    if (incomingVersion === currentVersion) continue;
    if (base && currentVersion === base) {
      applyProject(ctx.db, ctx.workspaceDir, incoming);
      continue;
    }
    if (base && incomingVersion === base) continue;

    const copyId = randomUUID();
    const copy = { ...incoming, id: copyId, name: conflictName(incoming.name, "手机冲突副本") };
    applyProject(ctx.db, ctx.workspaceDir, copy);
    branchCopies.set(incoming.id, copyId);
    conflicts.push({ kind: "project", id: incoming.id, title: incoming.name, copyId });
  }

  const branchChapterIds = new Map<string, string>();
  for (const chapter of request.snapshot.chapters) {
    if (branchCopies.has(chapter.record.projectId)) branchChapterIds.set(chapter.record.id, randomUUID());
  }

  for (const chapter of request.snapshot.chapters) {
    const originalProjectId = chapter.record.projectId;
    const branchProjectId = branchCopies.get(originalProjectId);
    if (!branchProjectId) continue;
    const copy = {
      record: {
        ...chapter.record,
        id: branchChapterIds.get(chapter.record.id)!,
        projectId: branchProjectId,
        parentId: chapter.record.parentId ? branchChapterIds.get(chapter.record.parentId) ?? null : null,
      },
      content: chapter.content,
      deleted: chapter.deleted,
    };
    applyChapter(ctx.db, copy);
  }

  for (const incoming of request.snapshot.chapters) {
    if (branchCopies.has(incoming.record.projectId)) continue;
    if (!incomingProjectIds.has(incoming.record.projectId)) continue;
    const key = mobileSyncChapterKey(incoming.record.id);
    const base = request.baseVersions[key];
    const incomingVersion = mobileSyncChapterHash(incoming);
    const current = serverChapters.get(incoming.record.id);

    if (!current) {
      if (base && incomingVersion === base) {
        // Permanent deletion is deliberately non-propagating: restore the retained phone copy.
        applyChapter(ctx.db, incoming);
        continue;
      }
      if (base) {
        const copyId = randomUUID();
        const copy = makeConflictChapter(incoming, copyId, "手机冲突副本", maxChapterOrder(ctx.db, incoming.record.projectId) + 1);
        applyChapter(ctx.db, copy);
        conflicts.push({ kind: "chapter", id: incoming.record.id, title: incoming.record.title, copyId });
      } else {
        applyChapter(ctx.db, incoming);
      }
      continue;
    }

    if (current.record.projectId !== incoming.record.projectId) {
      const copyId = randomUUID();
      const copy = makeConflictChapter(incoming, copyId, "手机冲突副本", maxChapterOrder(ctx.db, incoming.record.projectId) + 1);
      applyChapter(ctx.db, copy);
      conflicts.push({ kind: "chapter", id: incoming.record.id, title: incoming.record.title, copyId });
      continue;
    }

    const currentVersion = mobileSyncChapterHash(current);
    if (incomingVersion === currentVersion) continue;
    if (base && currentVersion === base) {
      applyChapter(ctx.db, incoming);
      continue;
    }
    if (base && incomingVersion === base) continue;

    const copyId = randomUUID();
    const copy = makeConflictChapter(incoming, copyId, "手机冲突副本", maxChapterOrder(ctx.db, incoming.record.projectId) + 1);
    applyChapter(ctx.db, copy);
    conflicts.push({ kind: "chapter", id: incoming.record.id, title: incoming.record.title, copyId });
  }

  const snapshot = buildDesktopMobileSyncSnapshot();
  const versions = mobileSyncSnapshotVersions(snapshot);
  return {
    format: "inkforge.mobile-sync",
    version: 1,
    snapshot,
    versions,
    conflicts,
    syncedAt: new Date().toISOString(),
  };
}
