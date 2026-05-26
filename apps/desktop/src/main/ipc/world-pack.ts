// =============================================================================
// Worldview Cards IPC handlers
// =============================================================================
// 单文件注册所有 world-pack:* + fusion 通道。
// 模式与 ipc/world.ts 一致：thin handler，业务在 service 层。
// =============================================================================

import { ipcMain } from "electron";
import type {
  ProjectWorldPackSlotRecord,
  WorldPackCoverReadInput,
  WorldPackCoverReadResponse,
  WorldPackCoverWriteInput,
  WorldPackCoverWriteResponse,
  WorldPackCreateInput,
  WorldPackDeleteInput,
  WorldPackEntryCreateInput,
  WorldPackEntryDeleteInput,
  WorldPackEntryListInput,
  WorldPackEntryRecord,
  WorldPackEntryUpdateInput,
  WorldPackFuseInput,
  WorldPackFuseResponse,
  WorldPackGetInput,
  WorldPackListInput,
  WorldPackRecord,
  WorldPackSlotAddInput,
  WorldPackSlotListInput,
  WorldPackSlotRemoveInput,
  WorldPackSlotReorderInput,
  WorldPackSlotToggleInput,
  WorldPackUpdateInput,
} from "@inkforge/shared";
import {
  addProjectPackSlotRecord,
  createWorldPack,
  createWorldPackEntry,
  deleteWorldPackEntryRecord,
  deleteWorldPackRecord,
  getWorldPackRecord,
  listProjectPackSlotRecords,
  listWorldPackEntryRecords,
  listWorldPackRecords,
  readWorldPackCover,
  removeProjectPackSlotRecord,
  reorderProjectPackSlotRecords,
  toggleProjectPackSlotRecord,
  updateWorldPackEntryRecord,
  updateWorldPackRecord,
  writeWorldPackCover,
} from "../services/world-pack-service";
import { fuseWorldPacks } from "../services/world-pack-fusion-service";

export function registerWorldPackHandlers(): void {
  ipcMain.handle(
    "world-pack:list",
    async (_e, input: WorldPackListInput): Promise<WorldPackRecord[]> =>
      listWorldPackRecords(input),
  );
  ipcMain.handle(
    "world-pack:get",
    async (_e, input: WorldPackGetInput): Promise<WorldPackRecord | null> =>
      getWorldPackRecord(input),
  );
  ipcMain.handle(
    "world-pack:create",
    async (_e, input: WorldPackCreateInput): Promise<WorldPackRecord> =>
      createWorldPack(input),
  );
  ipcMain.handle(
    "world-pack:update",
    async (_e, input: WorldPackUpdateInput): Promise<WorldPackRecord> =>
      updateWorldPackRecord(input),
  );
  ipcMain.handle(
    "world-pack:delete",
    async (_e, input: WorldPackDeleteInput): Promise<{ id: string }> =>
      deleteWorldPackRecord(input),
  );
  ipcMain.handle(
    "world-pack:entry-list",
    async (_e, input: WorldPackEntryListInput): Promise<WorldPackEntryRecord[]> =>
      listWorldPackEntryRecords(input),
  );
  ipcMain.handle(
    "world-pack:entry-create",
    async (_e, input: WorldPackEntryCreateInput): Promise<WorldPackEntryRecord> =>
      createWorldPackEntry(input),
  );
  ipcMain.handle(
    "world-pack:entry-update",
    async (_e, input: WorldPackEntryUpdateInput): Promise<WorldPackEntryRecord> =>
      updateWorldPackEntryRecord(input),
  );
  ipcMain.handle(
    "world-pack:entry-delete",
    async (_e, input: WorldPackEntryDeleteInput): Promise<{ id: string }> =>
      deleteWorldPackEntryRecord(input),
  );
  ipcMain.handle(
    "world-pack:slot-list",
    async (_e, input: WorldPackSlotListInput): Promise<ProjectWorldPackSlotRecord[]> =>
      listProjectPackSlotRecords(input),
  );
  ipcMain.handle(
    "world-pack:slot-add",
    async (_e, input: WorldPackSlotAddInput): Promise<ProjectWorldPackSlotRecord> =>
      addProjectPackSlotRecord(input),
  );
  ipcMain.handle(
    "world-pack:slot-remove",
    async (
      _e,
      input: WorldPackSlotRemoveInput,
    ): Promise<{ projectId: string; packId: string }> =>
      removeProjectPackSlotRecord(input),
  );
  ipcMain.handle(
    "world-pack:slot-toggle",
    async (
      _e,
      input: WorldPackSlotToggleInput,
    ): Promise<ProjectWorldPackSlotRecord | null> =>
      toggleProjectPackSlotRecord(input),
  );
  ipcMain.handle(
    "world-pack:slot-reorder",
    async (_e, input: WorldPackSlotReorderInput): Promise<{ ok: true }> =>
      reorderProjectPackSlotRecords(input),
  );
  ipcMain.handle(
    "world-pack:cover-write",
    async (
      _e,
      input: WorldPackCoverWriteInput,
    ): Promise<WorldPackCoverWriteResponse> => writeWorldPackCover(input),
  );
  ipcMain.handle(
    "world-pack:cover-read",
    async (
      _e,
      input: WorldPackCoverReadInput,
    ): Promise<WorldPackCoverReadResponse> => readWorldPackCover(input),
  );
  ipcMain.handle(
    "world-pack:fuse",
    async (_e, input: WorldPackFuseInput): Promise<WorldPackFuseResponse> =>
      fuseWorldPacks(input),
  );
}
