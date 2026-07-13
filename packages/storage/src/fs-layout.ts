import * as fs from "fs";
import * as path from "path";

export interface ProjectLayout {
  root: string;
  chapters: string;
  characters: string;
  world: string;
  history: string;
  bookJson: string;
}

const PROJECT_MARKER_DIR = ".inkforge";
const PROJECT_MARKER_FILE = "project.json";

interface ProjectMarker {
  format: "inkforge.project";
  projectId: string;
}

export function resolveProjectLayout(projectPath: string): ProjectLayout {
  return {
    root: projectPath,
    chapters: path.join(projectPath, "chapters"),
    characters: path.join(projectPath, "characters"),
    world: path.join(projectPath, "world"),
    history: path.join(projectPath, ".history"),
    bookJson: path.join(projectPath, "book.json"),
  };
}

export function ensureProjectLayout(projectPath: string, projectName: string): ProjectLayout {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.root, { recursive: true });
  fs.mkdirSync(layout.chapters, { recursive: true });
  fs.mkdirSync(layout.characters, { recursive: true });
  fs.mkdirSync(layout.world, { recursive: true });
  fs.mkdirSync(layout.history, { recursive: true });
  if (!fs.existsSync(layout.bookJson)) {
    fs.writeFileSync(
      layout.bookJson,
      JSON.stringify({ name: projectName, createdAt: new Date().toISOString() }, null, 2),
      "utf-8",
    );
  }
  return layout;
}

export function writeProjectMarker(projectPath: string, projectId: string): void {
  const markerDir = path.join(projectPath, PROJECT_MARKER_DIR);
  fs.mkdirSync(markerDir, { recursive: true });
  const marker: ProjectMarker = { format: "inkforge.project", projectId };
  fs.writeFileSync(
    path.join(markerDir, PROJECT_MARKER_FILE),
    JSON.stringify(marker, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );
}

export function hasProjectMarker(projectPath: string, projectId: string): boolean {
  try {
    const raw = fs.readFileSync(
      path.join(projectPath, PROJECT_MARKER_DIR, PROJECT_MARKER_FILE),
      "utf-8",
    );
    const marker = JSON.parse(raw) as Partial<ProjectMarker>;
    return marker.format === "inkforge.project" && marker.projectId === projectId;
  } catch {
    return false;
  }
}

export function sanitizeProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "untitled";
}

export function sanitizeFileSegment(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "untitled";
}

export function writeChapterFile(projectPath: string, relFilePath: string, content: string): string {
  const target = path.join(projectPath, relFilePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return target;
}

export function readChapterFile(projectPath: string, relFilePath: string): string {
  const target = path.join(projectPath, relFilePath);
  if (!fs.existsSync(target)) return "";
  return fs.readFileSync(target, "utf-8");
}

export function deleteChapterFile(projectPath: string, relFilePath: string): void {
  const target = path.join(projectPath, relFilePath);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

export function nextChapterFileName(projectPath: string, baseTitle: string): string {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.chapters, { recursive: true });
  const safe = sanitizeFileSegment(baseTitle);
  let candidate = `chapters/${safe}.md`;
  let counter = 2;
  while (fs.existsSync(path.join(projectPath, candidate))) {
    candidate = `chapters/${safe}-${counter}.md`;
    counter += 1;
  }
  return candidate;
}

export function removeProjectTree(
  projectPath: string,
  options: { projectsRoot: string; projectId: string },
): void {
  if (!projectPath || !fs.existsSync(projectPath)) return;
  const projectsRoot = fs.realpathSync(options.projectsRoot);
  const resolvedProject = fs.realpathSync(projectPath);
  const relative = path.relative(projectsRoot, resolvedProject);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to delete a project outside the workspace projects directory");
  }
  if (!hasProjectMarker(resolvedProject, options.projectId)) {
    throw new Error("Refusing to delete a directory without a matching InkForge project marker");
  }
  fs.rmSync(resolvedProject, { recursive: true, force: true });
}

/**
 * Disk-level recovery buffer used by the editor's 5s autosave.
 * Layout: `<project>/.history/.autosave-<chapterId>.md`.
 * Distinct from the DB-backed save path so a crash mid-debounce can be
 * recovered on next open.
 */
function autosavePath(projectPath: string, chapterId: string): string {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.history, { recursive: true });
  const safeId = chapterId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(layout.history, `.autosave-${safeId}.md`);
}

export function writeAutosave(
  projectPath: string,
  chapterId: string,
  content: string,
): number {
  const target = autosavePath(projectPath, chapterId);
  fs.writeFileSync(target, content, "utf-8");
  return fs.statSync(target).mtimeMs;
}

export function readAutosave(
  projectPath: string,
  chapterId: string,
): { content: string; savedAt: number } | null {
  const target = autosavePath(projectPath, chapterId);
  if (!fs.existsSync(target)) return null;
  const stat = fs.statSync(target);
  return { content: fs.readFileSync(target, "utf-8"), savedAt: stat.mtimeMs };
}

export function clearAutosave(projectPath: string, chapterId: string): void {
  const target = autosavePath(projectPath, chapterId);
  fs.rmSync(target, { force: true });
}

// =====================================================================
// M7 · Bookshelf 模块文件布局
// 全部走「.bookshelf/」「.history/snapshots/」隐藏目录，与现有
// chapters/ 物理隔离，旧用户数据不受影响。
// =====================================================================

export interface BookshelfDirs {
  /** `<project>/.bookshelf/`：封面、AutoWriter 临时件等 */
  bookshelf: string;
  /** `<project>/.history/snapshots/`：章节细粒度快照根目录 */
  snapshots: string;
}

export function resolveBookshelfDirs(projectPath: string): BookshelfDirs {
  return {
    bookshelf: path.join(projectPath, ".bookshelf"),
    snapshots: path.join(projectPath, ".history", "snapshots"),
  };
}

function ensureBookshelfDirs(projectPath: string): BookshelfDirs {
  const dirs = resolveBookshelfDirs(projectPath);
  fs.mkdirSync(dirs.bookshelf, { recursive: true });
  fs.mkdirSync(dirs.snapshots, { recursive: true });
  return dirs;
}

/** 接受常见图片扩展名；返回 sanitize 后的相对路径 `.bookshelf/cover.<ext>`。 */
export function relCoverPath(ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  return path.posix.join(".bookshelf", `cover.${safeExt}`);
}

export function writeCoverFile(
  projectPath: string,
  ext: string,
  bytes: Buffer,
): string {
  ensureBookshelfDirs(projectPath);
  const rel = relCoverPath(ext);
  const target = path.join(projectPath, rel);
  // 删除已存在的其他扩展名旧封面，确保同一项目只留一份封面文件
  const dir = path.dirname(target);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (/^cover\./i.test(f)) {
        const fp = path.join(dir, f);
        if (fp !== target) {
          try {
            fs.rmSync(fp, { force: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  fs.writeFileSync(target, bytes);
  return rel;
}

export function readCoverFile(
  projectPath: string,
  relPathOrExt: string,
): Buffer | null {
  // 兼容传相对路径或仅传扩展名
  const rel = relPathOrExt.startsWith(".bookshelf/")
    ? relPathOrExt
    : relCoverPath(relPathOrExt);
  const target = path.join(projectPath, rel);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target);
}

export function deleteCoverFile(projectPath: string, relPath: string): void {
  const target = path.join(projectPath, relPath);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

/** 计算单个快照文件相对项目根的路径。 */
export function relSnapshotPath(chapterId: string, snapshotId: string): string {
  const safeChap = chapterId.replace(/[^A-Za-z0-9._-]/g, "_");
  const safeSnap = snapshotId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.posix.join(".history", "snapshots", safeChap, `${safeSnap}.md`);
}

export function writeSnapshotFile(
  projectPath: string,
  chapterId: string,
  snapshotId: string,
  content: string,
): string {
  const rel = relSnapshotPath(chapterId, snapshotId);
  const target = path.join(projectPath, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return rel;
}

export function readSnapshotFile(projectPath: string, relPath: string): string | null {
  const target = path.join(projectPath, relPath);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, "utf-8");
}

export function deleteSnapshotFile(projectPath: string, relPath: string): void {
  const target = path.join(projectPath, relPath);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

/**
 * 删除某章节快照目录内除 keepRelPaths 之外的所有 `.md` 文件。
 * 用于 prune 自动快照（手动快照由调用方传入 keepRelPaths 保留）。
 */
export function pruneSnapshotsForChapter(
  projectPath: string,
  chapterId: string,
  keepRelPaths: string[],
): number {
  const safeChap = chapterId.replace(/[^A-Za-z0-9._-]/g, "_");
  const dir = path.join(projectPath, ".history", "snapshots", safeChap);
  if (!fs.existsSync(dir)) return 0;
  const keep = new Set(keepRelPaths.map((p) => path.normalize(p)));
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const rel = path.normalize(path.posix.join(".history", "snapshots", safeChap, f));
    if (keep.has(rel)) continue;
    try {
      fs.rmSync(path.join(dir, f), { force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}
