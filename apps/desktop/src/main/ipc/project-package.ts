import { dialog, ipcMain, type BrowserWindow } from "electron";
import { getProject } from "@inkforge/storage";
import type {
  ProjectPackageExportResponse,
  ProjectPackageImportResponse,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  exportProjectPackage,
  importProjectPackage,
} from "../services/project-package-service";
import {
  parseProjectPackageExportInput,
  parseProjectPackageImportInput,
} from "./validation";

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "inkforge-project";
}

export function registerProjectPackageHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    "project-package:export",
    async (_e, payload: unknown): Promise<ProjectPackageExportResponse> => {
      const input = parseProjectPackageExportInput(payload);
      const ctx = getAppContext();
      const project = getProject(ctx.db, input.projectId);
      if (!project) throw new Error(`Project not found: ${input.projectId}`);

      let outputPath = input.outputPath;
      if (!outputPath) {
        const window = getWindow();
        const defaultName = `${sanitizeFileName(input.fileName ?? project.name)}.inkforge.zip`;
        const result = window
          ? await dialog.showSaveDialog(window, {
              title: "导出项目备份包",
              defaultPath: defaultName,
              filters: [{ name: "InkForge 项目备份包", extensions: ["zip"] }],
            })
          : await dialog.showSaveDialog({
              title: "导出项目备份包",
              defaultPath: defaultName,
              filters: [{ name: "InkForge 项目备份包", extensions: ["zip"] }],
            });
        if (result.canceled || !result.filePath) {
          throw new Error("export_cancelled");
        }
        outputPath = result.filePath;
      }

      return exportProjectPackage({
        projectId: input.projectId,
        outputPath,
      });
    },
  );

  ipcMain.handle(
    "project-package:import",
    async (_e, payload: unknown): Promise<ProjectPackageImportResponse> => {
      const input = parseProjectPackageImportInput(payload);
      let filePath = input.filePath;
      if (!filePath) {
        const window = getWindow();
        const result = window
          ? await dialog.showOpenDialog(window, {
              title: "导入项目备份包",
              filters: [{ name: "InkForge 项目备份包", extensions: ["zip"] }],
              properties: ["openFile"],
            })
          : await dialog.showOpenDialog({
              title: "导入项目备份包",
              filters: [{ name: "InkForge 项目备份包", extensions: ["zip"] }],
              properties: ["openFile"],
            });
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error("import_cancelled");
        }
        filePath = result.filePaths[0];
      }

      return importProjectPackage({
        filePath,
        nameOverride: input.nameOverride,
      });
    },
  );
}
