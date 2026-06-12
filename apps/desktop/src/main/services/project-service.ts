import { randomUUID } from "crypto";
import * as path from "path";
import {
  deleteProject as deleteProjectRow,
  ensureProjectLayout,
  getProject,
  insertProject,
  listProjects,
  removeProjectTree,
  sanitizeProjectName,
  touchProject,
  updateProject,
} from "@inkforge/storage";
import type {
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectOpenInput,
  ProjectRecord,
  ProjectUpdateInput,
} from "@inkforge/shared";
import { getAppContext, updateWorkspaceConfig } from "./app-state";

export function createProject(input: ProjectCreateInput): ProjectRecord {
  const ctx = getAppContext();
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const safeName = sanitizeProjectName(name);
  const projectPath = input.path?.trim()
    ? path.resolve(input.path)
    : path.join(ctx.workspaceDir, "projects", safeName);
  ensureProjectLayout(projectPath, name);
  const record = insertProject(ctx.db, {
    id: randomUUID(),
    name,
    path: projectPath,
    dailyGoal: input.dailyGoal,
  });
  touchProject(ctx.db, record.id);
  if (!ctx.config.workspaceDir) {
    updateWorkspaceConfig({ workspaceDir: ctx.workspaceDir });
  }
  return record;
}

export function listProjectRecords(): ProjectRecord[] {
  const ctx = getAppContext();
  return listProjects(ctx.db);
}

export function updateProjectRecord(input: ProjectUpdateInput): ProjectRecord {
  const ctx = getAppContext();
  return updateProject(ctx.db, input);
}

export function deleteProject(input: ProjectDeleteInput): { id: string } {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.id);
  deleteProjectRow(ctx.db, input.id);
  if (project && input.removeFiles) removeProjectTree(project.path);
  return { id: input.id };
}

export function openProject(input: ProjectOpenInput): ProjectRecord {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.id);
  if (!project) throw new Error(`Project not found: ${input.id}`);
  touchProject(ctx.db, input.id);
  return { ...project, lastOpened: new Date().toISOString() };
}
