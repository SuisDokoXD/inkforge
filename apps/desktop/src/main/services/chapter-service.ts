import { randomUUID } from "crypto";
import * as path from "path";
import {
  addDailyWords,
  clearAutosave,
  deleteChapter as deleteChapterRow,
  deleteChapterFile,
  getChapter,
  getDailyProgress,
  getProject,
  insertChapter,
  listChapters,
  nextChapterFileName,
  readAutosave,
  readChapterFile,
  reorderChapters,
  updateChapter,
  writeAutosave,
  writeChapterFile,
} from "@inkforge/storage";
import type {
  ChapterAutosaveClearInput,
  ChapterAutosavePeekInput,
  ChapterAutosavePeekResponse,
  ChapterAutosaveWriteInput,
  ChapterCreateInput,
  ChapterDeleteInput,
  ChapterExportMdInput,
  ChapterExportMdResponse,
  ChapterImportMdInput,
  ChapterListInput,
  ChapterReadInput,
  ChapterReadResponse,
  ChapterRecord,
  ChapterReorderInput,
  ChapterUpdateInput,
  ProjectRecord,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import {
  checkAchievementsAndNotify,
  type AchievementTrigger,
} from "./achievement-service";
import { flushOnSave } from "./skill-trigger-service";
import { logger } from "./logger";

function resolveProject(projectId: string): ProjectRecord {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function defaultFilePath(input: ChapterCreateInput): string {
  if (input.filePath && input.filePath.trim()) return input.filePath.trim();
  const suffix = Date.now();
  return `chapters/chapter-${suffix}.md`;
}

function chapterInitialMarkdown(title: string): string {
  return `# ${title}\n\n`;
}

function stripLeadingTitle(content: string): { title?: string; body: string } {
  const match = content.match(/^\s*#\s+(.+?)\s*\n([\s\S]*)$/);
  if (match) return { title: match[1].trim(), body: match[2].trimStart() };
  return { body: content };
}

function checkChapterAchievements(projectId: string, trigger: AchievementTrigger): void {
  try {
    checkAchievementsAndNotify(projectId, trigger);
  } catch (error) {
    logger.warn("chapter achievement check failed", error);
  }
}

export function createChapter(input: ChapterCreateInput): ChapterRecord {
  const ctx = getAppContext();
  const project = resolveProject(input.projectId);
  const filePath = defaultFilePath(input);
  writeChapterFile(project.path, filePath, chapterInitialMarkdown(input.title));
  const record = insertChapter(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    title: input.title,
    order: input.order,
    status: input.status,
    wordCount: input.wordCount,
    filePath,
  });
  checkChapterAchievements(record.projectId, "chapter-create");
  return record;
}

export function updateChapterRecord(input: ChapterUpdateInput): ChapterRecord {
  const ctx = getAppContext();
  const current = getChapter(ctx.db, input.id);
  if (!current) throw new Error(`Chapter not found: ${input.id}`);
  const project = resolveProject(current.projectId);
  if (typeof input.content === "string") {
    writeChapterFile(project.path, input.filePath ?? current.filePath, input.content);
  }
  const { content: _content, ...rest } = input;
  const updated = updateChapter(ctx.db, rest);
  const shouldCheckAchievements =
    typeof input.wordCount === "number" || typeof input.title === "string";

  if (typeof input.wordCount === "number") {
    const delta = input.wordCount - current.wordCount;
    if (delta !== 0) addDailyWords(ctx.db, current.projectId, delta);
    getDailyProgress(ctx.db, current.projectId, project.dailyGoal);
  }
  if (shouldCheckAchievements) {
    checkChapterAchievements(current.projectId, "chapter-update");
  }

  if (typeof input.content === "string") {
    void flushOnSave({
      projectId: updated.projectId,
      chapterId: updated.id,
      chapterTitle: updated.title,
      chapterText: input.content,
    }).catch((error) => {
      logger.warn("skill on-save dispatch failed", error);
    });
  }

  return updated;
}

export function listChapterRecords(input: ChapterListInput): ChapterRecord[] {
  const ctx = getAppContext();
  return listChapters(ctx.db, input.projectId);
}

export function readChapter(input: ChapterReadInput): ChapterReadResponse {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
  const project = resolveProject(chapter.projectId);
  const content = readChapterFile(project.path, chapter.filePath);
  return { chapter, content };
}

export function deleteChapter(input: ChapterDeleteInput): { id: string } {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) return { id: input.id };
  const project = resolveProject(chapter.projectId);
  deleteChapterFile(project.path, chapter.filePath);
  deleteChapterRow(ctx.db, input.id);
  return { id: input.id };
}

export function reorderChapterRecords(input: ChapterReorderInput): ChapterRecord[] {
  const ctx = getAppContext();
  return reorderChapters(ctx.db, input.projectId, input.orderedIds);
}

export function importMarkdownChapter(input: ChapterImportMdInput): ChapterRecord {
  const ctx = getAppContext();
  const project = resolveProject(input.projectId);
  const parsed = stripLeadingTitle(input.content);
  const finalTitle = (input.title?.trim() || parsed.title || "导入章节").slice(0, 80);
  const filePath = nextChapterFileName(project.path, finalTitle);
  const body = parsed.title ? input.content : `# ${finalTitle}\n\n${input.content}`;
  writeChapterFile(project.path, filePath, body);
  const existing = listChapters(ctx.db, input.projectId);
  const order = existing.length + 1;
  const wordCount = body.replace(/\s+/g, "").length;
  const record = insertChapter(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    title: finalTitle,
    order,
    wordCount,
    filePath,
  });
  if (wordCount > 0) addDailyWords(ctx.db, input.projectId, wordCount);
  checkChapterAchievements(input.projectId, "chapter-create");
  return record;
}

export function exportMarkdownChapter(input: ChapterExportMdInput): ChapterExportMdResponse {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
  const project = resolveProject(chapter.projectId);
  const content = readChapterFile(project.path, chapter.filePath);
  const fileName = path.basename(chapter.filePath);
  return {
    id: chapter.id,
    title: chapter.title,
    fileName,
    content,
  };
}

export function writeChapterAutosave(input: ChapterAutosaveWriteInput): { savedAt: number } {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
  const project = resolveProject(chapter.projectId);
  const savedAt = writeAutosave(project.path, chapter.id, input.content);
  return { savedAt };
}

export function peekChapterAutosave(input: ChapterAutosavePeekInput): ChapterAutosavePeekResponse {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) return { content: null, savedAt: null, chapterUpdatedAt: null };
  const project = resolveProject(chapter.projectId);
  const snap = readAutosave(project.path, chapter.id);
  const chapterUpdatedAt = chapter.updatedAt ? new Date(chapter.updatedAt).getTime() : null;
  if (!snap) return { content: null, savedAt: null, chapterUpdatedAt };
  const dbContent = readChapterFile(project.path, chapter.filePath);
  if (snap.content === dbContent) {
    clearAutosave(project.path, chapter.id);
    return { content: null, savedAt: null, chapterUpdatedAt };
  }
  if (chapterUpdatedAt !== null && snap.savedAt <= chapterUpdatedAt) {
    clearAutosave(project.path, chapter.id);
    return { content: null, savedAt: null, chapterUpdatedAt };
  }
  return { content: snap.content, savedAt: snap.savedAt, chapterUpdatedAt };
}

export function clearChapterAutosave(input: ChapterAutosaveClearInput): { ok: true } {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.id);
  if (!chapter) return { ok: true };
  const project = resolveProject(chapter.projectId);
  clearAutosave(project.path, chapter.id);
  return { ok: true };
}
