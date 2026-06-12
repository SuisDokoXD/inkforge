import { ipcMain } from "electron";
import {
  ipcChannels,
  type SnapshotCreateResponse,
  type SnapshotGetResponse,
  type SnapshotRestoreResponse,
  type ChapterSnapshotRecord,
} from "@inkforge/shared";
import {
  createSnapshot,
  deleteSnapshot,
  getSnapshotWithContent,
  listSnapshots,
  restoreSnapshot,
} from "../services/snapshot-service";
import { checkAchievementsAndNotify } from "../services/achievement-service";
import {
  parseSnapshotCreateInput,
  parseSnapshotDeleteInput,
  parseSnapshotGetInput,
  parseSnapshotListInput,
  parseSnapshotRestoreInput,
} from "./validation";

const SNAPSHOT_CREATE: typeof ipcChannels.snapshotCreate = "snapshot:create";
const SNAPSHOT_LIST: typeof ipcChannels.snapshotList = "snapshot:list";
const SNAPSHOT_GET: typeof ipcChannels.snapshotGet = "snapshot:get";
const SNAPSHOT_RESTORE: typeof ipcChannels.snapshotRestore = "snapshot:restore";
const SNAPSHOT_DELETE: typeof ipcChannels.snapshotDelete = "snapshot:delete";

export function registerSnapshotHandlers(): void {
  ipcMain.handle(
    SNAPSHOT_CREATE,
    async (_event, payload: unknown): Promise<SnapshotCreateResponse> => {
      const input = parseSnapshotCreateInput(payload);
      const result = createSnapshot({
        chapterId: input.chapterId,
        projectId: input.projectId,
        kind: input.kind ?? "manual",
        label: input.label ?? null,
        runId: input.runId ?? null,
        agentRole: input.agentRole ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        // 手动快照默认不去重，让用户每次点都留痕
        dedupe: input.kind && input.kind !== "manual" ? true : false,
      });
      if ((input.kind ?? "manual") === "manual") {
        try {
          checkAchievementsAndNotify(input.projectId, "snapshot-create");
        } catch {
          /* do not block snapshot creation on achievement bookkeeping */
        }
      }
      return { snapshot: result.snapshot };
    },
  );

  ipcMain.handle(
    SNAPSHOT_LIST,
    async (_event, payload: unknown): Promise<ChapterSnapshotRecord[]> => {
      const input = parseSnapshotListInput(payload);
      return listSnapshots(input.chapterId, {
        limit: input.limit,
        kinds: input.kinds,
        runId: input.runId,
      });
    },
  );

  ipcMain.handle(
    SNAPSHOT_GET,
    async (_event, payload: unknown): Promise<SnapshotGetResponse> => {
      const input = parseSnapshotGetInput(payload);
      const result = getSnapshotWithContent(input.snapshotId);
      return { snapshot: result.snapshot, content: result.content };
    },
  );

  ipcMain.handle(
    SNAPSHOT_RESTORE,
    async (_event, payload: unknown): Promise<SnapshotRestoreResponse> => {
      const input = parseSnapshotRestoreInput(payload);
      const result = restoreSnapshot(input.snapshotId);
      return {
        restored: result.restored,
        preRestoreSnapshot: result.preRestoreSnapshot,
        chapterContent: result.chapterContent,
      };
    },
  );

  ipcMain.handle(
    SNAPSHOT_DELETE,
    async (_event, payload: unknown): Promise<{ snapshotId: string }> => {
      const input = parseSnapshotDeleteInput(payload);
      return deleteSnapshot(input.snapshotId);
    },
  );
}
