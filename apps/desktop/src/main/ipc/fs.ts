import { ipcMain, dialog, type BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import type {
  FsPickFileResponse,
  FsSaveFileResponse,
  ipcChannels,
} from "@inkforge/shared";
import { parseFsPickFileInput, parseFsSaveFileInput } from "./validation";

const FS_PICK_FILE: typeof ipcChannels.fsPickFile = "fs:pick-file";
const FS_SAVE_FILE: typeof ipcChannels.fsSaveFile = "fs:save-file";

const DEFAULT_MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "txt"] },
  { name: "All", extensions: ["*"] },
];

export function registerFsHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(FS_PICK_FILE, async (_event, payload: unknown): Promise<FsPickFileResponse> => {
    const input = parseFsPickFileInput(payload);
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: input.title,
          filters: input.filters ?? DEFAULT_MD_FILTERS,
          properties: ["openFile"],
        })
      : await dialog.showOpenDialog({
          title: input.title,
          filters: input.filters ?? DEFAULT_MD_FILTERS,
          properties: ["openFile"],
        });
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null, content: null, fileName: null };
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, "utf-8");
    return { path: filePath, content, fileName: path.basename(filePath) };
  });

  ipcMain.handle(FS_SAVE_FILE, async (_event, payload: unknown): Promise<FsSaveFileResponse> => {
    const input = parseFsSaveFileInput(payload);
    const win = getWindow();
    const result = win
      ? await dialog.showSaveDialog(win, {
          defaultPath: input.defaultPath,
          filters: input.filters ?? DEFAULT_MD_FILTERS,
        })
      : await dialog.showSaveDialog({
          defaultPath: input.defaultPath,
          filters: input.filters ?? DEFAULT_MD_FILTERS,
        });
    if (result.canceled || !result.filePath) return { path: null };
    fs.writeFileSync(result.filePath, input.content, "utf-8");
    return { path: result.filePath };
  });
}
