import { ipcMain } from "electron";
import {
  ipcChannels,
  type MaterialDeleteResponse,
  type MaterialListResponse,
  type MaterialRecord,
} from "@inkforge/shared";
import {
  createMaterial,
  listProjectMaterials,
  patchMaterial,
  removeMaterial,
} from "../services/material-service";
import {
  parseMaterialCreateInput,
  parseMaterialDeleteInput,
  parseMaterialListInput,
  parseMaterialUpdateInput,
} from "./validation";

const MAT_LIST: typeof ipcChannels.materialList = "material:list";
const MAT_CREATE: typeof ipcChannels.materialCreate = "material:create";
const MAT_UPDATE: typeof ipcChannels.materialUpdate = "material:update";
const MAT_DELETE: typeof ipcChannels.materialDelete = "material:delete";

export function registerMaterialHandlers(): void {
  ipcMain.handle(
    MAT_LIST,
    async (_e, input: unknown): Promise<MaterialListResponse> =>
      listProjectMaterials(parseMaterialListInput(input)),
  );
  ipcMain.handle(
    MAT_CREATE,
    async (_e, input: unknown): Promise<MaterialRecord> =>
      createMaterial(parseMaterialCreateInput(input)),
  );
  ipcMain.handle(
    MAT_UPDATE,
    async (_e, input: unknown): Promise<MaterialRecord> =>
      patchMaterial(parseMaterialUpdateInput(input)),
  );
  ipcMain.handle(
    MAT_DELETE,
    async (_e, input: unknown): Promise<MaterialDeleteResponse> =>
      removeMaterial(parseMaterialDeleteInput(input)),
  );
}
