import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import {
  deleteOutline as deleteOutlineRow,
  insertOutline,
  listOutlines,
  updateOutline,
} from "@inkforge/storage";
import type {
  OutlineCardRecord,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  parseOutlineCreateInput,
  parseOutlineDeleteInput,
  parseOutlineListInput,
  parseOutlineUpdateInput,
} from "./validation";

const OUTLINE_CREATE: typeof ipcChannels.outlineCreate = "outline:create";
const OUTLINE_UPDATE: typeof ipcChannels.outlineUpdate = "outline:update";
const OUTLINE_DELETE: typeof ipcChannels.outlineDelete = "outline:delete";
const OUTLINE_LIST: typeof ipcChannels.outlineList = "outline:list";

export function registerOutlineHandlers(): void {
  ipcMain.handle(OUTLINE_CREATE, async (_event, input: unknown): Promise<OutlineCardRecord> => {
    const ctx = getAppContext();
    return insertOutline(ctx.db, { id: randomUUID(), ...parseOutlineCreateInput(input) });
  });
  ipcMain.handle(OUTLINE_UPDATE, async (_event, input: unknown): Promise<OutlineCardRecord> => {
    const ctx = getAppContext();
    return updateOutline(ctx.db, parseOutlineUpdateInput(input));
  });
  ipcMain.handle(OUTLINE_DELETE, async (_event, input: unknown): Promise<{ id: string }> => {
    const parsed = parseOutlineDeleteInput(input);
    const ctx = getAppContext();
    deleteOutlineRow(ctx.db, parsed.id);
    return { id: parsed.id };
  });
  ipcMain.handle(OUTLINE_LIST, async (_event, input: unknown): Promise<OutlineCardRecord[]> => {
    const parsed = parseOutlineListInput(input);
    const ctx = getAppContext();
    return listOutlines(ctx.db, parsed.projectId, parsed.chapterId);
  });
}
