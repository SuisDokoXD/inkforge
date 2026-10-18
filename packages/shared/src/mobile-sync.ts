import type { ChapterRecord, ProjectRecord } from "./domain";

/** Project fields safe and meaningful to synchronize; local filesystem paths never leave the desktop. */
export type MobileSyncProject = Omit<ProjectRecord, "path" | "lastOpened">;

/** Chapter content is included, but the desktop's relative file path is never sent. */
export interface MobileSyncChapter {
  record: Omit<ChapterRecord, "filePath" | "updatedAt">;
  content: string;
  deleted: boolean;
}

export interface MobileSyncSnapshot {
  projects: MobileSyncProject[];
  chapters: MobileSyncChapter[];
}

export interface MobileSyncRequest {
  format: "inkforge.mobile-sync";
  version: 1;
  deviceId: string;
  snapshot: MobileSyncSnapshot;
  /** SHA-256 versions from the last successful sync, keyed by project:<id> / chapter:<id>. */
  baseVersions: Record<string, string>;
}

export interface MobileSyncConflict {
  kind: "project" | "chapter";
  id: string;
  title: string;
  copyId: string;
}

export interface MobileSyncResponse {
  format: "inkforge.mobile-sync";
  version: 1;
  snapshot: MobileSyncSnapshot;
  versions: Record<string, string>;
  conflicts: MobileSyncConflict[];
  syncedAt: string;
}

/** Small renderer-safe summary emitted after a phone sync commits on desktop. */
export interface MobileSyncCompletedEvent {
  deviceName: string;
  projectCount: number;
  chapterCount: number;
  conflictCount: number;
  syncedAt: string;
}

/** Persisted per-device sync summary. Counts and a timestamp only — never book content or paths. */
export interface MobileSyncDeviceLastSync {
  syncedAt: string;
  projectCount: number;
  chapterCount: number;
  conflictCount: number;
}

export interface MobileSyncDeviceSummary {
  id: string;
  name: string;
  pairedAt: string;
  /** null until that device completes its first sync. */
  lastSync: MobileSyncDeviceLastSync | null;
}

export interface MobileSyncStatus {
  running: boolean;
  endpoint: string | null;
  pairingCode: string | null;
  pairingCodeExpiresAt: number | null;
  autoStart: boolean;
  devices: MobileSyncDeviceSummary[];
}

export const mobileSyncProjectKey = (id: string): string => `project:${id}`;
export const mobileSyncChapterKey = (id: string): string => `chapter:${id}`;

export function mobileSyncCanonicalValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(mobileSyncCanonicalValue).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${mobileSyncCanonicalValue(item)}`).join(",")}}`;
}

export async function mobileSyncHash(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("此设备不支持安全的同步版本校验。");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(mobileSyncCanonicalValue(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function mobileSyncProjectValue(project: MobileSyncProject): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    dailyGoal: project.dailyGoal,
    synopsis: project.synopsis,
    genre: project.genre,
    subGenre: project.subGenre,
    tags: project.tags,
    masterOutline: project.masterOutline,
    preRefineMasterOutline: project.preRefineMasterOutline,
    globalWorldview: project.globalWorldview,
  };
}

export function mobileSyncChapterValue(chapter: MobileSyncChapter): Record<string, unknown> {
  return {
    id: chapter.record.id,
    projectId: chapter.record.projectId,
    parentId: chapter.record.parentId,
    title: chapter.record.title,
    order: chapter.record.order,
    status: chapter.record.status,
    wordCount: chapter.record.wordCount,
    content: chapter.content,
    deleted: chapter.deleted,
  };
}

export async function mobileSyncProjectVersion(project: MobileSyncProject): Promise<string> {
  return mobileSyncHash(mobileSyncProjectValue(project));
}

export async function mobileSyncChapterVersion(chapter: MobileSyncChapter): Promise<string> {
  return mobileSyncHash(mobileSyncChapterValue(chapter));
}
