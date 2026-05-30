import { BrowserWindow, app, screen, shell } from "electron";
import * as fs from "fs";
import * as path from "path";

interface SavedBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_BOUNDS: SavedBounds = {
  width: 1400,
  height: 900,
};

function boundsFile(): string {
  return path.join(app.getPath("userData"), "window-bounds.json");
}

function loadSavedBounds(): SavedBounds {
  try {
    const raw = fs.readFileSync(boundsFile(), "utf8");
    const parsed = JSON.parse(raw) as SavedBounds;
    if (
      typeof parsed.width === "number" &&
      typeof parsed.height === "number" &&
      parsed.width >= 600 &&
      parsed.height >= 400
    ) {
      return parsed;
    }
  } catch {
    /* first launch / corrupted — fall through */
  }
  return DEFAULT_BOUNDS;
}

function saveBounds(window: BrowserWindow): void {
  try {
    const isMaximized = window.isMaximized();
    // 最大化时 getBounds() 是全屏，把它转成 normalBounds 才能下次以正常尺寸还原
    const normal = isMaximized ? window.getNormalBounds() : window.getBounds();
    const data: SavedBounds = {
      width: normal.width,
      height: normal.height,
      x: normal.x,
      y: normal.y,
      isMaximized,
    };
    fs.writeFileSync(boundsFile(), JSON.stringify(data));
  } catch {
    /* writing window state isn't critical, swallow */
  }
}

/** 把保存的位置 clamp 到当前显示器，避免外接屏拔了之后窗口飞出可视区 */
function clampToDisplay(b: SavedBounds): SavedBounds {
  if (typeof b.x !== "number" || typeof b.y !== "number") return b;
  const displays = screen.getAllDisplays();
  const isVisible = displays.some((d) => {
    const r = d.workArea;
    return (
      (b.x as number) + b.width > r.x &&
      (b.x as number) < r.x + r.width &&
      (b.y as number) + b.height > r.y &&
      (b.y as number) < r.y + r.height
    );
  });
  if (isVisible) return b;
  // 任何显示器都不能完全覆盖 → 退化到主屏居中
  return { width: b.width, height: b.height };
}

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const saved = clampToDisplay(loadSavedBounds());
  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1000,
    minHeight: 640,
    // 窗口底色：取浅色主题主背景，避免 resize/最大化时新露出的边缘闪深色。
    // （深色主题用户会在缩放瞬间看到一帧浅色；如需主题感知可改为 setBackgroundColor IPC。）
    backgroundColor: "#f7fafe",
    title: "InkForge",
    show: false,
    // 自定义无边框 titlebar：Windows/Linux 完全自画；macOS 保留交通灯但隐藏标题栏
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
    if (saved.isMaximized) window.maximize();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 持久化窗口尺寸/位置：debounce 写盘，关窗时强制写一次
  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveBounds(window), 400);
  };
  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);
  window.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveBounds(window);
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return window;
}
