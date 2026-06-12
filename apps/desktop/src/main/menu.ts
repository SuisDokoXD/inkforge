import {
  Menu,
  app,
  shell,
  BrowserWindow,
  clipboard,
  type MenuItemConstructorOptions,
} from "electron";
import * as path from "path";
import { buildDiagSnapshot } from "./services/diag-service";
import { getAppSettings } from "@inkforge/storage";
import { getAppContext } from "./services/app-state";
import { openExternalHttpUrl } from "./external-url";

async function copyDiagToClipboard(): Promise<void> {
  try {
    const res = await buildDiagSnapshot({ tailLines: 200 });
    clipboard.writeText(res.text);
  } catch (err) {
    clipboard.writeText(`(diag snapshot failed: ${(err as Error).message})`);
  }
}

function devModeEnabled(): boolean {
  try {
    const ctx = getAppContext();
    return getAppSettings(ctx.db).devModeEnabled;
  } catch {
    return false;
  }
}

export function buildAppMenu(): void {
  const isMac = process.platform === "darwin";
  const dev = devModeEnabled();

  const devSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "打开日志目录",
      click: () => {
        void shell.openPath(path.join(app.getPath("userData"), "logs"));
      },
    },
    {
      label: "打开工作目录",
      click: () => {
        try {
          const ctx = getAppContext();
          void shell.openPath(ctx.workspaceDir);
        } catch (err) {
          void shell.openPath(app.getPath("userData"));
        }
      },
    },
    { type: "separator" },
    { role: "toggleDevTools" },
    {
      label: "重新加载窗口",
      accelerator: "Ctrl+R",
      click: () => BrowserWindow.getFocusedWindow()?.reload(),
    },
    { type: "separator" },
    {
      label: "复制诊断摘要",
      click: async () => {
        await copyDiagToClipboard();
      },
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            { role: "services" as const },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    {
      label: "文件",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    ...(dev ? [{ label: "开发者", submenu: devSubmenu }] : []),
    {
      label: "帮助",
      submenu: [
        {
          label: "访问 GitHub",
          click: () => {
            void openExternalHttpUrl("https://github.com/tompignofind123-cyber/inkforge");
          },
        },
        {
          label: "复制诊断摘要",
          click: async () => {
            await copyDiagToClipboard();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
