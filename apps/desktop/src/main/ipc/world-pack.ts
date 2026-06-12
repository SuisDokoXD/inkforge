// =============================================================================
// Worldview Cards IPC handlers
// =============================================================================
// 单文件注册所有 world-pack:* + fusion 通道。
// 模式与 ipc/world.ts 一致：thin handler，业务在 service 层。
// =============================================================================

import { ipcMain } from "electron";
import type {
  ProjectWorldPackSlotRecord,
  WorldPackCoverReadResponse,
  WorldPackCoverWriteResponse,
  WorldPackEntryRecord,
  WorldPackFuseResponse,
  WorldPackRecord,
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
import {
  parseWorldPackCoverReadInput,
  parseWorldPackCoverWriteInput,
  parseWorldPackCreateInput,
  parseWorldPackDeleteInput,
  parseWorldPackEntryCreateInput,
  parseWorldPackEntryDeleteInput,
  parseWorldPackEntryListInput,
  parseWorldPackEntryUpdateInput,
  parseWorldPackFuseInput,
  parseWorldPackGetInput,
  parseWorldPackListInput,
  parseWorldPackSlotAddInput,
  parseWorldPackSlotListInput,
  parseWorldPackSlotRemoveInput,
  parseWorldPackSlotReorderInput,
  parseWorldPackSlotToggleInput,
  parseWorldPackUpdateInput,
} from "./validation";

export function registerWorldPackHandlers(): void {
  ipcMain.handle(
    "world-pack:list",
    async (_e, input: unknown): Promise<WorldPackRecord[]> =>
      listWorldPackRecords(parseWorldPackListInput(input)),
  );
  ipcMain.handle(
    "world-pack:get",
    async (_e, input: unknown): Promise<WorldPackRecord | null> =>
      getWorldPackRecord(parseWorldPackGetInput(input)),
  );
  ipcMain.handle(
    "world-pack:create",
    async (_e, input: unknown): Promise<WorldPackRecord> =>
      createWorldPack(parseWorldPackCreateInput(input)),
  );
  ipcMain.handle(
    "world-pack:update",
    async (_e, input: unknown): Promise<WorldPackRecord> =>
      updateWorldPackRecord(parseWorldPackUpdateInput(input)),
  );
  ipcMain.handle(
    "world-pack:delete",
    async (_e, input: unknown): Promise<{ id: string }> =>
      deleteWorldPackRecord(parseWorldPackDeleteInput(input)),
  );
  ipcMain.handle(
    "world-pack:entry-list",
    async (_e, input: unknown): Promise<WorldPackEntryRecord[]> =>
      listWorldPackEntryRecords(parseWorldPackEntryListInput(input)),
  );
  ipcMain.handle(
    "world-pack:entry-create",
    async (_e, input: unknown): Promise<WorldPackEntryRecord> =>
      createWorldPackEntry(parseWorldPackEntryCreateInput(input)),
  );
  ipcMain.handle(
    "world-pack:entry-update",
    async (_e, input: unknown): Promise<WorldPackEntryRecord> =>
      updateWorldPackEntryRecord(parseWorldPackEntryUpdateInput(input)),
  );
  ipcMain.handle(
    "world-pack:entry-delete",
    async (_e, input: unknown): Promise<{ id: string }> =>
      deleteWorldPackEntryRecord(parseWorldPackEntryDeleteInput(input)),
  );
  ipcMain.handle(
    "world-pack:slot-list",
    async (_e, input: unknown): Promise<ProjectWorldPackSlotRecord[]> =>
      listProjectPackSlotRecords(parseWorldPackSlotListInput(input)),
  );
  ipcMain.handle(
    "world-pack:slot-add",
    async (_e, input: unknown): Promise<ProjectWorldPackSlotRecord> =>
      addProjectPackSlotRecord(parseWorldPackSlotAddInput(input)),
  );
  ipcMain.handle(
    "world-pack:slot-remove",
    async (
      _e,
      input: unknown,
    ): Promise<{ projectId: string; packId: string }> =>
      removeProjectPackSlotRecord(parseWorldPackSlotRemoveInput(input)),
  );
  ipcMain.handle(
    "world-pack:slot-toggle",
    async (
      _e,
      input: unknown,
    ): Promise<ProjectWorldPackSlotRecord | null> =>
      toggleProjectPackSlotRecord(parseWorldPackSlotToggleInput(input)),
  );
  ipcMain.handle(
    "world-pack:slot-reorder",
    async (_e, input: unknown): Promise<{ ok: true }> =>
      reorderProjectPackSlotRecords(parseWorldPackSlotReorderInput(input)),
  );
  ipcMain.handle(
    "world-pack:cover-write",
    async (
      _e,
      input: unknown,
    ): Promise<WorldPackCoverWriteResponse> =>
      writeWorldPackCover(parseWorldPackCoverWriteInput(input)),
  );
  ipcMain.handle(
    "world-pack:cover-read",
    async (
      _e,
      input: unknown,
    ): Promise<WorldPackCoverReadResponse> =>
      readWorldPackCover(parseWorldPackCoverReadInput(input)),
  );
  ipcMain.handle(
    "world-pack:fuse",
    async (_e, input: unknown): Promise<WorldPackFuseResponse> =>
      fuseWorldPacks(parseWorldPackFuseInput(input)),
  );
}
