import { ipcMain } from "electron";
import type {
  WorldEntryRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  createWorldEntry,
  deleteWorldEntryRecord,
  getWorldEntry,
  listWorldEntryRecords,
  searchWorldEntryRecords,
  updateWorldEntryRecord,
} from "../services/world-service";
import {
  parseWorldCreateInput,
  parseWorldDeleteInput,
  parseWorldGetInput,
  parseWorldListInput,
  parseWorldSearchInput,
  parseWorldUpdateInput,
} from "./validation";

const WORLD_LIST: typeof ipcChannels.worldList = "world:list";
const WORLD_GET: typeof ipcChannels.worldGet = "world:get";
const WORLD_CREATE: typeof ipcChannels.worldCreate = "world:create";
const WORLD_UPDATE: typeof ipcChannels.worldUpdate = "world:update";
const WORLD_DELETE: typeof ipcChannels.worldDelete = "world:delete";
const WORLD_SEARCH: typeof ipcChannels.worldSearch = "world:search";

export function registerWorldHandlers(): void {
  ipcMain.handle(
    WORLD_LIST,
    async (_event, input: unknown): Promise<WorldEntryRecord[]> =>
      listWorldEntryRecords(parseWorldListInput(input)),
  );
  ipcMain.handle(
    WORLD_GET,
    async (_event, input: unknown): Promise<WorldEntryRecord | null> =>
      getWorldEntry(parseWorldGetInput(input)),
  );
  ipcMain.handle(
    WORLD_CREATE,
    async (_event, input: unknown): Promise<WorldEntryRecord> =>
      createWorldEntry(parseWorldCreateInput(input)),
  );
  ipcMain.handle(
    WORLD_UPDATE,
    async (_event, input: unknown): Promise<WorldEntryRecord> =>
      updateWorldEntryRecord(parseWorldUpdateInput(input)),
  );
  ipcMain.handle(
    WORLD_DELETE,
    async (_event, input: unknown): Promise<{ id: string }> =>
      deleteWorldEntryRecord(parseWorldDeleteInput(input)),
  );
  ipcMain.handle(
    WORLD_SEARCH,
    async (_event, input: unknown): Promise<WorldEntryRecord[]> =>
      searchWorldEntryRecords(parseWorldSearchInput(input)),
  );
}
