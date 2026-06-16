import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  insertChapter,
  insertOutline,
  insertProject,
  listChapters,
  listOutlines,
  openDatabase,
  readChapterFile,
  runMigrations,
  type DB,
  type Keystore,
} from "@inkforge/storage";

const appContextRef = vi.hoisted(() => ({
  current: null as null | { db: DB; workspaceDir: string },
}));

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
      },
      db: appContextRef.current.db,
      keystore: {
        setKey: vi.fn(),
        getKey: vi.fn(),
        deleteKey: vi.fn(),
      } satisfies Keystore,
    };
  },
}));

import { prepareChapterFromOutlineCard } from "../outline-service";

describe("prepareChapterFromOutlineCard", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-outline-service-"));
    db = openDatabase({ workspaceDir });
    runMigrations(db);
    appContextRef.current = { db, workspaceDir };
    insertProject(db, {
      id: "project-1",
      name: "测试项目",
      path: join(workspaceDir, "project-1"),
    });
  });

  afterEach(() => {
    appContextRef.current = null;
    if (db) db.close();
    if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates and binds an empty chapter for an unwritten outline card", () => {
    insertOutline(db, {
      id: "card-1",
      projectId: "project-1",
      title: "第1章 · 开端",
      content: "章纲内容",
      status: "planned",
      order: 1,
    });

    const result = prepareChapterFromOutlineCard({
      projectId: "project-1",
      outlineCardId: "card-1",
    });

    expect(result.chapter).toMatchObject({
      projectId: "project-1",
      title: "第1章 · 开端",
      wordCount: 0,
    });
    expect(result.outlineCard).toMatchObject({
      id: "card-1",
      chapterId: result.chapter.id,
    });
    expect(listChapters(db, "project-1")).toHaveLength(1);
    expect(listOutlines(db, "project-1")[0]?.chapterId).toBe(result.chapter.id);
    expect(readChapterFile(join(workspaceDir, "project-1"), result.chapter.filePath)).toBe(
      "# 第1章 · 开端\n\n",
    );
  });

  it("reuses an already linked chapter without creating a duplicate", () => {
    insertChapter(db, {
      id: "chapter-1",
      projectId: "project-1",
      title: "第1章 · 开端",
      order: 1,
      filePath: "chapters/one.md",
    });
    insertOutline(db, {
      id: "card-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      title: "第1章 · 开端",
      content: "章纲内容",
      status: "draft",
      order: 1,
    });

    const result = prepareChapterFromOutlineCard({
      projectId: "project-1",
      outlineCardId: "card-1",
    });

    expect(result.chapter.id).toBe("chapter-1");
    expect(listChapters(db, "project-1")).toHaveLength(1);
  });

  it("rejects missing outline cards without creating a chapter", () => {
    expect(() =>
      prepareChapterFromOutlineCard({
        projectId: "project-1",
        outlineCardId: "missing-card",
      }),
    ).toThrow("outline_card_not_found");

    expect(listChapters(db, "project-1")).toHaveLength(0);
  });

  it("rejects cross-project outline cards without creating a chapter", () => {
    insertProject(db, {
      id: "project-2",
      name: "另一个项目",
      path: join(workspaceDir, "project-2"),
    });
    insertOutline(db, {
      id: "foreign-card",
      projectId: "project-2",
      title: "第1章 · 开端",
      content: "外部章纲",
      status: "planned",
      order: 1,
    });

    expect(() =>
      prepareChapterFromOutlineCard({
        projectId: "project-1",
        outlineCardId: "foreign-card",
      }),
    ).toThrow("cross_project_card");

    expect(listChapters(db, "project-1")).toHaveLength(0);
    expect(listOutlines(db, "project-2")[0]?.chapterId).toBeNull();
  });
});
