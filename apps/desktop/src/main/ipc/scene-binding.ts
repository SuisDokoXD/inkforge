import { ipcMain } from "electron";
import {
  getAppSettings,
  listSceneBindings,
  resetSceneBinding,
  setAppSettings,
  upsertSceneBinding,
} from "@inkforge/storage";
import type {
  SceneBindingListResponse,
  SceneBindingRecord,
  SceneRoutingMode,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  parseSceneBindingResetInput,
  parseSceneBindingSetModeInput,
  parseSceneBindingUpsertInput,
} from "./validation";

const SCENE_BINDING_LIST = "scene-binding:list";
const SCENE_BINDING_UPSERT = "scene-binding:upsert";
const SCENE_BINDING_RESET = "scene-binding:reset";
const SCENE_BINDING_GET_MODE = "scene-binding:get-mode";
const SCENE_BINDING_SET_MODE = "scene-binding:set-mode";

export function registerSceneBindingHandlers(): void {
  ipcMain.handle(
    SCENE_BINDING_LIST,
    async (): Promise<SceneBindingListResponse> => {
      const ctx = getAppContext();
      const mode = getAppSettings(ctx.db).sceneRoutingMode;
      return {
        mode,
        basic: listSceneBindings(ctx.db, "basic"),
        advanced: listSceneBindings(ctx.db, "advanced"),
      };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_UPSERT,
    async (
      _event,
      input: unknown,
    ): Promise<SceneBindingRecord> => {
      const parsed = parseSceneBindingUpsertInput(input);
      const ctx = getAppContext();
      return upsertSceneBinding(ctx.db, {
        mode: parsed.mode,
        sceneKey: parsed.sceneKey,
        providerId: parsed.providerId,
        model: parsed.model,
      });
    },
  );

  ipcMain.handle(
    SCENE_BINDING_RESET,
    async (
      _event,
      input: unknown,
    ): Promise<{ sceneKey: SceneBindingRecord["sceneKey"] }> => {
      const parsed = parseSceneBindingResetInput(input);
      const ctx = getAppContext();
      resetSceneBinding(ctx.db, parsed.mode, parsed.sceneKey);
      return { sceneKey: parsed.sceneKey };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_GET_MODE,
    async (): Promise<{ mode: SceneRoutingMode }> => {
      const ctx = getAppContext();
      return { mode: getAppSettings(ctx.db).sceneRoutingMode };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_SET_MODE,
    async (
      _event,
      input: unknown,
    ): Promise<{ mode: SceneRoutingMode }> => {
      const parsed = parseSceneBindingSetModeInput(input);
      const ctx = getAppContext();
      setAppSettings(ctx.db, { sceneRoutingMode: parsed.mode });
      return { mode: parsed.mode };
    },
  );
}
