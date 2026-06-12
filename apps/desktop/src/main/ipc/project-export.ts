import { dialog, ipcMain, type BrowserWindow } from "electron";
import {
  exportProjectDocx,
  exportProjectEpub,
  exportProjectHtml,
  exportProjectMd,
  exportProjectTxt,
} from "../services/export-service";
import {
  importEpubChapters,
  importTxtChapters,
} from "../services/chapter-import-service";
import { getProject } from "@inkforge/storage";
import { getAppContext } from "../services/app-state";
import type {
  ChapterImportBulkResponse,
  ProjectExportResponse,
} from "@inkforge/shared";
import {
  parseChapterImportEpubInput,
  parseChapterImportTxtInput,
  parseProjectExportInput,
} from "./validation";

interface ExportFormat {
  channel: string;
  ext: string;
  filterName: string;
  exporter: (
    projectId: string,
    outputPath: string,
  ) => Promise<{ byteCount: number; chapterCount: number }>;
}

const FORMATS: ExportFormat[] = [
  { channel: "project:export-txt", ext: "txt", filterName: "Plain Text", exporter: exportProjectTxt },
  { channel: "project:export-md", ext: "md", filterName: "Markdown", exporter: exportProjectMd },
  { channel: "project:export-html", ext: "html", filterName: "HTML", exporter: exportProjectHtml },
  { channel: "project:export-docx", ext: "docx", filterName: "Word Document", exporter: exportProjectDocx },
  { channel: "project:export-epub", ext: "epub", filterName: "EPUB", exporter: exportProjectEpub },
];

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "novel";
}

export function registerProjectExportHandlers(getWindow: () => BrowserWindow | null): void {
  for (const fmt of FORMATS) {
    ipcMain.handle(
      fmt.channel,
      async (_e, payload: unknown): Promise<ProjectExportResponse> => {
        const input = parseProjectExportInput(payload, fmt.channel);
        const ctx = getAppContext();
        const project = getProject(ctx.db, input.projectId);
        if (!project) throw new Error(`Project not found: ${input.projectId}`);

        let outputPath = input.outputPath;
        if (!outputPath) {
          const window = getWindow();
          const defaultName = `${sanitizeFileName(input.fileName ?? project.name)}.${fmt.ext}`;
          const result = window
            ? await dialog.showSaveDialog(window, {
                title: `导出为 ${fmt.ext.toUpperCase()}`,
                defaultPath: defaultName,
                filters: [{ name: fmt.filterName, extensions: [fmt.ext] }],
              })
            : await dialog.showSaveDialog({
                title: `导出为 ${fmt.ext.toUpperCase()}`,
                defaultPath: defaultName,
                filters: [{ name: fmt.filterName, extensions: [fmt.ext] }],
              });
          if (result.canceled || !result.filePath) {
            throw new Error("export_cancelled");
          }
          outputPath = result.filePath;
        }

        const out = await fmt.exporter(input.projectId, outputPath);
        return {
          projectId: input.projectId,
          outputPath,
          byteCount: out.byteCount,
          chapterCount: out.chapterCount,
        };
      },
    );
  }

  ipcMain.handle(
    "chapter:import-txt",
    async (_e, payload: unknown): Promise<ChapterImportBulkResponse> => {
      return importTxtChapters(parseChapterImportTxtInput(payload));
    },
  );

  ipcMain.handle(
    "chapter:import-epub",
    async (_e, payload: unknown): Promise<ChapterImportBulkResponse> => {
      return importEpubChapters(parseChapterImportEpubInput(payload));
    },
  );
}
