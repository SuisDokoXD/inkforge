import { ipcMain } from "electron";
import type {
  ProjectRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  createProject,
  deleteProject,
  listProjectRecords,
  openProject,
  updateProjectRecord,
} from "../services/project-service";
import {
  parseProjectCreateInput,
  parseProjectDeleteInput,
  parseProjectOpenInput,
  parseProjectUpdateInput,
} from "./validation";

const PROJECT_CREATE: typeof ipcChannels.projectCreate = "project:create";
const PROJECT_LIST: typeof ipcChannels.projectList = "project:list";
const PROJECT_UPDATE: typeof ipcChannels.projectUpdate = "project:update";
const PROJECT_DELETE: typeof ipcChannels.projectDelete = "project:delete";
const PROJECT_OPEN: typeof ipcChannels.projectOpen = "project:open";

export function registerProjectHandlers(): void {
  ipcMain.handle(PROJECT_CREATE, async (_event, input: unknown): Promise<ProjectRecord> => {
    return createProject(parseProjectCreateInput(input));
  });

  ipcMain.handle(PROJECT_LIST, async (): Promise<ProjectRecord[]> => {
    return listProjectRecords();
  });

  ipcMain.handle(PROJECT_UPDATE, async (_event, input: unknown): Promise<ProjectRecord> => {
    return updateProjectRecord(parseProjectUpdateInput(input));
  });

  ipcMain.handle(PROJECT_DELETE, async (_event, input: unknown): Promise<{ id: string }> => {
    return deleteProject(parseProjectDeleteInput(input));
  });

  ipcMain.handle(PROJECT_OPEN, async (_event, input: unknown): Promise<ProjectRecord> => {
    return openProject(parseProjectOpenInput(input));
  });
}
