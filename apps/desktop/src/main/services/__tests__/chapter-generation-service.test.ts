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
  runMigrations,
  type DB,
  type Keystore,
} from "@inkforge/storage";

const appContextRef = vi.hoisted(() => ({ current: null as null | { db: DB; workspaceDir: string } }));
const serviceMocks = vi.hoisted(() => ({
  triggerChapterSummary: vi.fn(),
  createSnapshot: vi.fn(),
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

vi.mock("../chapter-summary-service", () => ({
  triggerChapterSummary: serviceMocks.triggerChapterSummary,
}));

vi.mock("../snapshot-service", () => ({
  createSnapshot: serviceMocks.createSnapshot,
}));

import {
  CHAPTER_GENERATION_LIMITS,
  commitChapterDraft,
  isTokenLimitFinish,
  looksAbruptlyCutOff,
  shouldContinueChapterDraft,
} from "../chapter-generation-service";

describe("CHAPTER_GENERATION_LIMITS", () => {
  it("keeps chapter generation permissive enough to favor complete drafts", () => {
    expect(CHAPTER_GENERATION_LIMITS.defaultMaxTokens).toBeGreaterThanOrEqual(10000);
    expect(CHAPTER_GENERATION_LIMITS.continuationMaxTokens).toBeGreaterThanOrEqual(4000);
    expect(CHAPTER_GENERATION_LIMITS.maxContinuations).toBeGreaterThanOrEqual(3);
  });
});

describe("isTokenLimitFinish", () => {
  it("detects token-limit finish reasons", () => {
    expect(isTokenLimitFinish("length")).toBe(true);
    expect(isTokenLimitFinish("max_tokens")).toBe(true);
    expect(isTokenLimitFinish("MAX_TOKENS")).toBe(true);
    expect(isTokenLimitFinish("token_limit")).toBe(true);
  });

  it("ignores normal stop reasons", () => {
    expect(isTokenLimitFinish("stop")).toBe(false);
    expect(isTokenLimitFinish(undefined)).toBe(false);
  });
});

describe("looksAbruptlyCutOff", () => {
  it("ignores long text that ends with punctuation", () => {
    expect(looksAbruptlyCutOff(`${"paragraph ".repeat(40)}.`)).toBe(false);
  });

  it("detects long text that ends mid-word", () => {
    expect(looksAbruptlyCutOff("paragraph ".repeat(40).trimEnd())).toBe(true);
  });

  it("ignores short text", () => {
    expect(looksAbruptlyCutOff("short")).toBe(false);
    expect(looksAbruptlyCutOff("")).toBe(false);
  });
});

describe("shouldContinueChapterDraft", () => {
  it("continues after token-limit finish", () => {
    expect(
      shouldContinueChapterDraft({
        text: `${"paragraph ".repeat(40)}.`,
        finishReason: "length",
      }),
    ).toBe(true);
  });

  it("continues after abrupt text cut-off", () => {
    expect(
      shouldContinueChapterDraft({
        text: "paragraph ".repeat(40).trimEnd(),
        finishReason: "stop",
      }),
    ).toBe(true);
  });

  it("stops after complete text", () => {
    expect(
      shouldContinueChapterDraft({
        text: `${"paragraph ".repeat(40)}.`,
        finishReason: "stop",
      }),
    ).toBe(false);
  });

  it("does not continue empty text", () => {
    expect(shouldContinueChapterDraft({ text: "", finishReason: "length" })).toBe(false);
  });
});

describe("commitChapterDraft", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-chapter-gen-"));
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
    serviceMocks.triggerChapterSummary.mockReset();
    serviceMocks.createSnapshot.mockReset();
    appContextRef.current = null;
    if (db) db.close();
    if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("rejects a stale outline card instead of creating an unlinked duplicate chapter", () => {
    expect(() =>
      commitChapterDraft({
        projectId: "project-1",
        outlineCardId: "missing-card",
        title: "第1章 · 开端",
        text: "正文内容",
      }),
    ).toThrow("outline_card_not_found");

    expect(listChapters(db, "project-1")).toHaveLength(0);
  });

  it("rejects cross-project outline cards instead of creating an unlinked duplicate chapter", () => {
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
      order: 0,
    });

    expect(() =>
      commitChapterDraft({
        projectId: "project-1",
        outlineCardId: "foreign-card",
        title: "第1章 · 开端",
        text: "正文内容",
      }),
    ).toThrow("cross_project_card");

    expect(listChapters(db, "project-1")).toHaveLength(0);
    expect(listOutlines(db, "project-2")[0]?.chapterId).toBeNull();
  });

  it("reuses the chapter linked to an outline card instead of inserting another same-name chapter", () => {
    insertChapter(db, {
      id: "chapter-1",
      projectId: "project-1",
      title: "第1章 · 开端",
      order: 0,
      filePath: "chapters/one.md",
    });
    insertOutline(db, {
      id: "card-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      title: "第1章 · 开端",
      content: "已绑定章纲",
      status: "written",
      order: 0,
    });

    const result = commitChapterDraft({
      projectId: "project-1",
      outlineCardId: "card-1",
      title: "第1章 · 开端",
      text: "新正文内容",
    });

    expect(result.chapterId).toBe("chapter-1");
    expect(listChapters(db, "project-1")).toHaveLength(1);
    expect(listOutlines(db, "project-1")[0]).toMatchObject({
      id: "card-1",
      chapterId: "chapter-1",
      status: "written",
    });
  });
});
