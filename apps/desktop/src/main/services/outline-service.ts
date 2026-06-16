import { randomUUID } from "crypto";
import {
  deleteChapterFile,
  getChapter,
  getOutline,
  getProject,
  insertChapter,
  nextChapterFileName,
  updateOutline,
  writeChapterFile,
} from "@inkforge/storage";
import type {
  OutlinePrepareChapterInput,
  OutlinePrepareChapterResponse,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

function chapterInitialMarkdown(title: string): string {
  return `# ${title}\n\n`;
}

export function prepareChapterFromOutlineCard(
  input: OutlinePrepareChapterInput,
): OutlinePrepareChapterResponse {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`project_not_found:${input.projectId}`);

  const outlineCard = getOutline(ctx.db, input.outlineCardId);
  if (!outlineCard) throw new Error("outline_card_not_found");
  if (outlineCard.projectId !== input.projectId) throw new Error("cross_project_card");

  if (outlineCard.chapterId) {
    const linkedChapter = getChapter(ctx.db, outlineCard.chapterId);
    if (!linkedChapter) throw new Error("outline_chapter_missing");
    if (linkedChapter.projectId !== input.projectId) throw new Error("cross_project_chapter");
    return { chapter: linkedChapter, outlineCard };
  }

  const chapterId = randomUUID();
  const filePath = nextChapterFileName(project.path, outlineCard.title);
  writeChapterFile(project.path, filePath, chapterInitialMarkdown(outlineCard.title));

  try {
    const createAndBind = ctx.db.transaction(() => {
      const chapter = insertChapter(ctx.db, {
        id: chapterId,
        projectId: input.projectId,
        title: outlineCard.title,
        order: outlineCard.order,
        status: "draft",
        wordCount: 0,
        filePath,
      });
      const updatedCard = updateOutline(ctx.db, {
        id: outlineCard.id,
        chapterId,
        status: "draft",
      });
      return { chapter, outlineCard: updatedCard };
    });
    return createAndBind();
  } catch (error) {
    deleteChapterFile(project.path, filePath);
    throw error;
  }
}
