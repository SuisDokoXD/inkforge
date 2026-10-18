import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProject,
  deleteProject,
  listChapters,
  openDatabase,
  readChapterFile,
  runMigrations,
  updateChapter,
  writeChapterFile,
  type DB,
} from "@inkforge/storage";
import type { MobileSyncChapter, MobileSyncProject, MobileSyncRequest } from "@inkforge/shared";
import { mobileSyncChapterVersion, mobileSyncProjectVersion } from "@inkforge/shared";

const appContextRef = vi.hoisted(() => ({ current: null as null | { db: DB; workspaceDir: string } }));

vi.mock("../app-state", () => ({
  getAppContext: () => {
    if (!appContextRef.current) throw new Error("missing test app context");
    return {
      userDataDir: appContextRef.current.workspaceDir,
      workspaceDir: appContextRef.current.workspaceDir,
      config: {
        workspaceDir: appContextRef.current.workspaceDir,
        uiLanguage: "zh",
        analysisEnabled: true,
        analysisThreshold: 200,
        mobileSyncAutoStart: false,
        mobileSyncServeOwned: false,
        mobileSyncServePort: null,
        mobileSyncDevices: [],
      },
      db: appContextRef.current.db,
      keystore: {},
    };
  },
}));

import { findServePathEntry, tailscaleServeStartArgs, tailscaleServeStopArgs } from "../mobile-sync-host";
import { parseMobileSyncRequest, syncMobileWorkspace } from "../mobile-sync-workspace";

describe("mobile sync workspace host", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-mobile-sync-"));
    db = openDatabase({ workspaceDir });
    runMigrations(db);
    appContextRef.current = { db, workspaceDir };
  });

  afterEach(() => {
    appContextRef.current = null;
    if (db) db.close();
    if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("strips client filesystem paths while validating a sync request", () => {
    const request = parseMobileSyncRequest({
      format: "inkforge.mobile-sync",
      version: 1,
      deviceId: "android-1",
      baseVersions: {},
      snapshot: {
        projects: [{ ...project(), path: "D:/private/project", lastOpened: "now" }],
        chapters: [{ record: { ...chapter().record, filePath: "../../secret.md", updatedAt: "now" }, content: "正文", deleted: false }],
      },
    }, "android-1");
    expect(request.snapshot.projects[0]).not.toHaveProperty("path");
    expect(request.snapshot.projects[0]).not.toHaveProperty("lastOpened");
    expect(request.snapshot.chapters[0].record).not.toHaveProperty("filePath");
    expect(request.snapshot.chapters[0].record).not.toHaveProperty("updatedAt");
  });

  it("imports a new mobile project and retains both versions on concurrent chapter edits", async () => {
    const initial: MobileSyncRequest = {
      format: "inkforge.mobile-sync",
      version: 1,
      deviceId: "android-1",
      baseVersions: {},
      snapshot: { projects: [project()], chapters: [chapter("手机初稿")] },
    };
    const first = await syncMobileWorkspace(initial, "android-1");
    expect(first.snapshot.projects).toHaveLength(1);
    expect(first.snapshot.chapters).toHaveLength(1);
    expect(first.snapshot.projects[0]).not.toHaveProperty("path");
    expect(first.snapshot.chapters[0].record).not.toHaveProperty("filePath");
    expect(first.versions["project:book-1"]).toBe(await mobileSyncProjectVersion(first.snapshot.projects[0]));
    expect(first.versions["chapter:chapter-1"]).toBe(await mobileSyncChapterVersion(first.snapshot.chapters[0]));

    const storedProject = getProject(db, "book-1");
    const storedChapter = listChapters(db, "book-1")[0];
    expect(storedProject).not.toBeNull();
    expect(storedChapter).toBeDefined();
    expect(storedProject!.path.startsWith(workspaceDir)).toBe(true);
    expect(readChapterFile(storedProject!.path, storedChapter.filePath)).toBe("手机初稿");

    writeChapterFile(storedProject!.path, storedChapter.filePath, "桌面修改版");
    updateChapter(db, { id: storedChapter.id, wordCount: 5 });

    const phoneEdit: MobileSyncChapter = {
      ...first.snapshot.chapters[0],
      record: { ...first.snapshot.chapters[0].record, wordCount: 4 },
      content: "手机并发修改版",
    };
    const second = await syncMobileWorkspace({
      ...initial,
      snapshot: { projects: first.snapshot.projects, chapters: [phoneEdit] },
      baseVersions: first.versions,
    }, "android-1");

    expect(second.conflicts).toHaveLength(1);
    expect(second.conflicts[0].kind).toBe("chapter");
    expect(second.snapshot.chapters).toHaveLength(2);
    expect(second.snapshot.chapters.find(item => item.record.id === "chapter-1")?.content).toBe("桌面修改版");
    expect(second.snapshot.chapters.find(item => item.record.id === second.conflicts[0].copyId)?.content).toBe("手机并发修改版");
    expect(second.snapshot.chapters.find(item => item.record.id === second.conflicts[0].copyId)?.record.title).toContain("手机冲突副本");
  });

  it("restores phone copies when a desktop-side permanent delete is not propagated", async () => {
    const initial: MobileSyncRequest = {
      format: "inkforge.mobile-sync",
      version: 1,
      deviceId: "android-1",
      baseVersions: {},
      snapshot: { projects: [project()], chapters: [chapter("手机保留稿")] },
    };
    const first = await syncMobileWorkspace(initial, "android-1");
    deleteProject(db, "book-1");
    expect(getProject(db, "book-1")).toBeNull();

    const restored = await syncMobileWorkspace({
      ...initial,
      snapshot: first.snapshot,
      baseVersions: first.versions,
    }, "android-1");

    expect(restored.conflicts).toHaveLength(0);
    expect(restored.snapshot.projects.map(item => item.id)).toContain("book-1");
    expect(restored.snapshot.chapters.find(item => item.record.id === "chapter-1")?.content).toBe("手机保留稿");
    expect(getProject(db, "book-1")).not.toBeNull();
  });

  it("manages only the InkForge Serve mount instead of resetting other routes", () => {
    const status = {
      Web: {
        "https://laptop.tail123.ts.net": {
          Handlers: {
            "/inkforge": { Proxy: "http://127.0.0.1:47831" },
            "/komga": { Proxy: "http://127.0.0.1:25600" },
          },
        },
      },
    };
    expect(findServePathEntry(status)).toEqual({ found: true, proxy: "http://127.0.0.1:47831" });
    expect(findServePathEntry(status, "/missing")).toBeNull();
    expect(tailscaleServeStartArgs(47831)).toContain("--set-path=/inkforge");
    expect(tailscaleServeStartArgs(47831)).toContain("http://127.0.0.1:47831");
    expect(tailscaleServeStopArgs()).toEqual(["serve", "--https=443", "--set-path=/inkforge", "off"]);
    expect(tailscaleServeStopArgs()).not.toContain("reset");
  });
});

function project(): MobileSyncProject {
  return {
    id: "book-1",
    name: "测试作品",
    createdAt: "2026-01-01T00:00:00.000Z",
    dailyGoal: 2000,
    synopsis: "",
    genre: "",
    subGenre: "",
    tags: [],
    masterOutline: "",
    preRefineMasterOutline: null,
    globalWorldview: "",
  };
}

function chapter(content = "正文"): MobileSyncChapter {
  return {
    record: {
      id: "chapter-1",
      projectId: "book-1",
      parentId: null,
      title: "第一章",
      order: 0,
      status: "draft",
      wordCount: Array.from(content.replace(/\s/g, "")).length,
    },
    content,
    deleted: false,
  };
}
