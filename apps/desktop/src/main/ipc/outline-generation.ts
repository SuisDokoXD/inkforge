import { ipcMain } from "electron";
import type {
  ChapterCommitDraftResponse,
  ChapterGenerateFromOutlineResponse,
  OutlineGenerateChaptersResponse,
  OutlineGenerateMasterResponse,
  OutlineRefineResponse,
  OutlineUndoRefineResponse,
  ProjectRecord,
} from "@inkforge/shared";
import {
  generateChapterOutlines,
  generateMasterOutline,
  refineOutline,
  undoRefineMaster,
  updateProjectCreativeMeta,
} from "../services/outline-generation-service";
import {
  commitChapterDraft,
  generateChapterFromOutline,
} from "../services/chapter-generation-service";
import {
  parseChapterCommitDraftInput,
  parseChapterGenerateFromOutlineInput,
  parseOutlineGenerateChaptersInput,
  parseOutlineGenerateMasterInput,
  parseOutlineRefineInput,
  parseOutlineUndoRefineInput,
  parseProjectUpdateMetaInput,
} from "./validation";

export function registerOutlineGenerationHandlers(): void {
  ipcMain.handle(
    "project:update-meta",
    async (_e, input: unknown): Promise<ProjectRecord> => {
      return updateProjectCreativeMeta(parseProjectUpdateMetaInput(input));
    },
  );

  ipcMain.handle(
    "outline:generate-master",
    async (_e, input: unknown): Promise<OutlineGenerateMasterResponse> => {
      return generateMasterOutline(parseOutlineGenerateMasterInput(input));
    },
  );

  ipcMain.handle(
    "outline:generate-chapters",
    async (_e, input: unknown): Promise<OutlineGenerateChaptersResponse> => {
      return generateChapterOutlines(parseOutlineGenerateChaptersInput(input));
    },
  );

  ipcMain.handle(
    "outline:refine",
    async (_e, input: unknown): Promise<OutlineRefineResponse> => {
      return refineOutline(parseOutlineRefineInput(input));
    },
  );

  ipcMain.handle(
    "outline:undo-refine",
    async (_e, input: unknown): Promise<OutlineUndoRefineResponse> => {
      return undoRefineMaster(parseOutlineUndoRefineInput(input));
    },
  );

  ipcMain.handle(
    "chapter:generate-from-outline",
    async (_e, input: unknown): Promise<ChapterGenerateFromOutlineResponse> => {
      return generateChapterFromOutline(parseChapterGenerateFromOutlineInput(input));
    },
  );

  ipcMain.handle(
    "chapter:commit-draft",
    async (_e, input: unknown): Promise<ChapterCommitDraftResponse> => {
      return commitChapterDraft(parseChapterCommitDraftInput(input));
    },
  );
}
