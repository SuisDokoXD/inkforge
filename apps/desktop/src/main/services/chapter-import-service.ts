import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  getProject,
  insertChapter,
  listChapters,
  nextChapterFileName,
  writeChapterFile,
} from "@inkforge/storage";
import type { ChapterRecord } from "@inkforge/shared";
import { getAppContext } from "./app-state";
import {
  decodeTextBuffer,
  parseEpubChapters,
  splitTextIntoChapters,
  type ParsedChapter,
} from "./sample-lib-service";

interface BulkImportResult {
  projectId: string;
  created: number;
  chapterIds: string[];
}

function chapterMarkdown(title: string, body: string): string {
  return `# ${title}\n\n${body.trim()}\n`;
}

function importParsedChapters(
  projectId: string,
  parsed: ParsedChapter[],
): BulkImportResult {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (parsed.length === 0) return { projectId, created: 0, chapterIds: [] };

  const existing = listChapters(ctx.db, projectId);
  let order = existing.length;
  const created: ChapterRecord[] = [];
  for (const ch of parsed) {
    const title = ch.chapterTitle?.trim() || `章节 ${ch.ordinal}`;
    const filePath = nextChapterFileName(project.path, title);
    const md = chapterMarkdown(title, ch.text);
    writeChapterFile(project.path, filePath, md);
    const wordCount = Array.from(ch.text).filter((c) => /\S/.test(c)).length;
    const record = insertChapter(ctx.db, {
      id: randomUUID(),
      projectId,
      title,
      order,
      status: "draft",
      wordCount,
      filePath,
    });
    created.push(record);
    order += 1;
  }
  return {
    projectId,
    created: created.length,
    chapterIds: created.map((c) => c.id),
  };
}

export async function importTxtChapters(input: {
  projectId: string;
  filePath: string;
}): Promise<BulkImportResult> {
  const buf = await fs.readFile(input.filePath);
  const text = decodeTextBuffer(buf);
  const parsed = splitTextIntoChapters(text);
  return importParsedChapters(input.projectId, parsed);
}

export async function importEpubChapters(input: {
  projectId: string;
  filePath: string;
}): Promise<BulkImportResult> {
  const { chapters } = await parseEpubChapters(input.filePath);
  if (chapters.length === 0) {
    throw new Error("EPUB 未解析出正文章节：请确认文件包含有效目录/spine，或先转为 TXT 后导入");
  }
  return importParsedChapters(input.projectId, chapters);
}
