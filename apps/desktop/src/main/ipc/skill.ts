import { ipcMain, type BrowserWindow } from "electron";
import type {
  SkillDefinition,
  SkillExportJsonResponse,
  SkillImportReport,
  SkillRunResponse,
  ipcChannels,
} from "@inkforge/shared";
import {
  createSkillRecord,
  deleteSkillRecord,
  getSkillRecord,
  listSkillRecords,
  runSkill,
  updateSkillRecord,
} from "../services/skill-service";
import { exportSkillJson, importSkillJson } from "../services/skill-io-service";
import {
  parseSkillCreateInput,
  parseSkillDeleteInput,
  parseSkillExportJsonInput,
  parseSkillGetInput,
  parseSkillImportJsonInput,
  parseSkillListInput,
  parseSkillRunInput,
  parseSkillUpdateInput,
} from "./validation";

const SKILL_CREATE: typeof ipcChannels.skillCreate = "skill:create";
const SKILL_UPDATE: typeof ipcChannels.skillUpdate = "skill:update";
const SKILL_GET: typeof ipcChannels.skillGet = "skill:get";
const SKILL_LIST: typeof ipcChannels.skillList = "skill:list";
const SKILL_DELETE: typeof ipcChannels.skillDelete = "skill:delete";
const SKILL_RUN: typeof ipcChannels.skillRun = "skill:run";
const SKILL_IMPORT_JSON: typeof ipcChannels.skillImportJson = "skill:import-json";
const SKILL_EXPORT_JSON: typeof ipcChannels.skillExportJson = "skill:export-json";

export function registerSkillHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(SKILL_CREATE, async (_event, input: unknown): Promise<SkillDefinition> => {
    return createSkillRecord(parseSkillCreateInput(input));
  });
  ipcMain.handle(SKILL_UPDATE, async (_event, input: unknown): Promise<SkillDefinition> => {
    return updateSkillRecord(parseSkillUpdateInput(input));
  });
  ipcMain.handle(SKILL_GET, async (_event, input: unknown): Promise<SkillDefinition | null> => {
    return getSkillRecord(parseSkillGetInput(input));
  });
  ipcMain.handle(SKILL_LIST, async (_event, input: unknown): Promise<SkillDefinition[]> => {
    return listSkillRecords(parseSkillListInput(input));
  });
  ipcMain.handle(SKILL_DELETE, async (_event, input: unknown): Promise<{ id: string }> => {
    return deleteSkillRecord(parseSkillDeleteInput(input));
  });
  ipcMain.handle(SKILL_RUN, async (_event, input: unknown): Promise<SkillRunResponse> => {
    return runSkill({
      input: parseSkillRunInput(input),
      window: getWindow(),
    });
  });
  ipcMain.handle(SKILL_IMPORT_JSON, async (_event, input: unknown): Promise<SkillImportReport> => {
    const parsed = parseSkillImportJsonInput(input);
    return importSkillJson({
      jsonText: parsed.content,
      onConflict: parsed.onConflict,
      scopeOverride: parsed.scopeOverride,
    });
  });
  ipcMain.handle(
    SKILL_EXPORT_JSON,
    async (_event, input: unknown): Promise<SkillExportJsonResponse> => {
      return exportSkillJson(parseSkillExportJsonInput(input));
    },
  );
}
