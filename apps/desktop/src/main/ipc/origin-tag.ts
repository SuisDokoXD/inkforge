import { ipcMain } from "electron";
import {
  getChapterOrigin,
  listChapterIdsByOrigin,
  listChapterOriginsForProject,
  listChapters,
  setChapterOrigin,
} from "@inkforge/storage";
import {
  ipcChannels,
  type ChapterOriginTagRecord,
  type OriginTagListByOriginResponse,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  parseOriginTagGetInput,
  parseOriginTagListByOriginInput,
  parseOriginTagSetInput,
} from "./validation";

const ORIGIN_SET: typeof ipcChannels.originTagSet = "origin-tag:set";
const ORIGIN_GET: typeof ipcChannels.originTagGet = "origin-tag:get";
const ORIGIN_LIST: typeof ipcChannels.originTagListByOrigin =
  "origin-tag:list-by-origin";

export function registerOriginTagHandlers(): void {
  ipcMain.handle(
    ORIGIN_SET,
    async (_event, input: unknown): Promise<ChapterOriginTagRecord> => {
      const parsed = parseOriginTagSetInput(input);
      const ctx = getAppContext();
      return setChapterOrigin(ctx.db, parsed.chapterId, parsed.origin);
    },
  );

  ipcMain.handle(
    ORIGIN_GET,
    async (_event, input: unknown): Promise<ChapterOriginTagRecord | null> => {
      const parsed = parseOriginTagGetInput(input);
      const ctx = getAppContext();
      return getChapterOrigin(ctx.db, parsed.chapterId);
    },
  );

  ipcMain.handle(
    ORIGIN_LIST,
    async (
      _event,
      input: unknown,
    ): Promise<OriginTagListByOriginResponse> => {
      const parsed = parseOriginTagListByOriginInput(input);
      const ctx = getAppContext();
      const tagged = listChapterIdsByOrigin(ctx.db, parsed.projectId, parsed.origin);
      const includeUntagged = parsed.includeUntagged ?? true;
      if (parsed.origin !== "manual" || !includeUntagged) {
        return { chapterIds: tagged };
      }
      // 把未打任何标签的章节也归入 'manual'
      const allChapters = listChapters(ctx.db, parsed.projectId);
      const allTags = listChapterOriginsForProject(ctx.db, parsed.projectId);
      const knownTagged = new Set(allTags.map((t) => t.chapterId));
      const result: string[] = [...tagged];
      for (const chapter of allChapters) {
        if (!knownTagged.has(chapter.id)) {
          result.push(chapter.id);
        }
      }
      return { chapterIds: result };
    },
  );
}
