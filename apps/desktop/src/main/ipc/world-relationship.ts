import { ipcMain } from "electron";
import {
  deleteWorldRelationship,
  listWorldRelationships,
  saveWorldRelationship,
} from "@inkforge/storage";
import type {
  WorldRelationshipRecord,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  parseWorldRelationshipDeleteInput,
  parseWorldRelationshipListInput,
  parseWorldRelationshipSaveInput,
} from "./validation";

const LIST = "world-relationship:list";
const SAVE = "world-relationship:save";
const DELETE = "world-relationship:delete";

export function registerWorldRelationshipHandlers(): void {
  ipcMain.handle(LIST, async (_e, input: unknown): Promise<WorldRelationshipRecord[]> => {
    const parsed = parseWorldRelationshipListInput(input);
    const ctx = getAppContext();
    return listWorldRelationships(ctx.db, parsed.projectId);
  });

  ipcMain.handle(SAVE, async (_e, input: unknown): Promise<WorldRelationshipRecord> => {
    const parsed = parseWorldRelationshipSaveInput(input);
    const ctx = getAppContext();
    return saveWorldRelationship(ctx.db, {
      id: parsed.id,
      projectId: parsed.projectId,
      srcKind: parsed.srcKind,
      srcId: parsed.srcId,
      dstKind: parsed.dstKind,
      dstId: parsed.dstId,
      label: parsed.label ?? null,
      weight: parsed.weight,
    });
  });

  ipcMain.handle(DELETE, async (_e, input: unknown): Promise<{ id: string }> => {
    const parsed = parseWorldRelationshipDeleteInput(input);
    const ctx = getAppContext();
    deleteWorldRelationship(ctx.db, parsed.id);
    return { id: parsed.id };
  });
}
