import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db";
import { openDatabase } from "../db";
import { runMigrations } from "../migrations";
import {
  countChapterWords,
  deleteChapter,
  getChapter,
  insertChapter,
  listChapters,
  reorderChapters,
  updateChapter,
} from "../repositories/chapter-repo";
import {
  deleteMaterial,
  getMaterial,
  insertMaterial,
  listMaterials,
  updateMaterial,
} from "../repositories/material-repo";
import {
  deleteProject,
  getProject,
  insertProject,
  listProjects,
  updateProjectMeta,
} from "../repositories/project-repo";
import {
  deleteProvider,
  getFirstProviderPersistenceRecord,
  getProviderPersistenceRecord,
  listProviders,
  updateProviderKeyStrategy,
  upsertProvider,
} from "../repositories/provider-repo";

describe("SQLite repository integration", () => {
  let workspaceDir = "";
  let db: DB | null = null;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-storage-"));
    db = openDatabase({ workspaceDir, fileName: "test.db" });
    runMigrations(db);
  });

  afterEach(() => {
    db?.close();
    db = null;
    if (workspaceDir) {
      rmSync(workspaceDir, { recursive: true, force: true });
      workspaceDir = "";
    }
  });

  function currentDb(): DB {
    if (!db) throw new Error("test database not opened");
    return db;
  }

  it("runs the full schema and persists project and chapter rows with cascades", () => {
    const database = currentDb();
    const migrationCount = database
      .prepare("SELECT COUNT(*) AS total FROM schema_migrations")
      .get() as { total: number };

    expect(migrationCount.total).toBeGreaterThanOrEqual(27);

    const project = insertProject(database, {
      id: "project-1",
      name: "Novel",
      path: join(workspaceDir, "Novel"),
      dailyGoal: 1500,
    });

    expect(project).toMatchObject({
      id: "project-1",
      dailyGoal: 1500,
      synopsis: "",
      globalWorldview: "",
    });

    const updatedProject = updateProjectMeta(database, {
      id: project.id,
      synopsis: "A city under two moons.",
      genre: "fantasy",
      tags: ["moon", "city"],
      masterOutline: "Act I",
      globalWorldview: "Magic follows tides.",
    });

    expect(updatedProject).toMatchObject({
      synopsis: "A city under two moons.",
      genre: "fantasy",
      tags: ["moon", "city"],
      masterOutline: "Act I",
      globalWorldview: "Magic follows tides.",
    });

    insertChapter(database, {
      id: "chapter-2",
      projectId: project.id,
      title: "Second",
      order: 2,
      wordCount: 600,
      filePath: "chapters/002.md",
    });
    insertChapter(database, {
      id: "chapter-1",
      projectId: project.id,
      title: "First",
      order: 1,
      wordCount: 400,
      filePath: "chapters/001.md",
    });

    expect(listProjects(database).map((row) => row.id)).toEqual([project.id]);
    expect(listChapters(database, project.id).map((row) => row.title)).toEqual([
      "First",
      "Second",
    ]);
    expect(countChapterWords(database, project.id)).toBe(1000);

    const edited = updateChapter(database, {
      id: "chapter-1",
      status: "revised",
      wordCount: 450,
    });

    expect(edited).toMatchObject({
      id: "chapter-1",
      status: "revised",
      wordCount: 450,
    });
    expect(countChapterWords(database, project.id)).toBe(1050);

    expect(reorderChapters(database, project.id, ["chapter-2", "chapter-1"]).map((row) => row.id))
      .toEqual(["chapter-2", "chapter-1"]);

    deleteChapter(database, "chapter-2");
    expect(getChapter(database, "chapter-2")).toBeNull();

    deleteProject(database, project.id);
    expect(getProject(database, project.id)).toBeNull();
    expect(listChapters(database, project.id)).toEqual([]);
  });

  it("round-trips materials with JSON tags and kind filtering", () => {
    const database = currentDb();
    const project = insertProject(database, {
      id: "project-materials",
      name: "Materials",
      path: join(workspaceDir, "Materials"),
    });

    insertMaterial(database, {
      id: "mat-1",
      projectId: project.id,
      kind: "idea",
      title: "Opening image",
      content: "Rain on copper roofs.",
      tags: ["opening", "mood"],
    });
    insertMaterial(database, {
      id: "mat-2",
      projectId: project.id,
      kind: "world",
      title: "Moon guild",
      tags: ["lore"],
    });

    expect(listMaterials(database, project.id).map((row) => row.id)).toEqual([
      "mat-2",
      "mat-1",
    ]);
    expect(listMaterials(database, project.id, "idea").map((row) => row.title)).toEqual([
      "Opening image",
    ]);

    const updated = updateMaterial(database, {
      id: "mat-1",
      kind: "plot",
      title: "Inciting image",
      tags: ["plot"],
    });

    expect(updated).toMatchObject({
      kind: "plot",
      title: "Inciting image",
      tags: ["plot"],
    });

    deleteMaterial(database, "mat-2");
    expect(getMaterial(database, "mat-2")).toBeNull();
  });

  it("persists provider records, encrypted fields, and key strategy settings", () => {
    const database = currentDb();

    upsertProvider(database, {
      id: "provider-1",
      label: "OpenAI Compatible",
      vendor: "openai-compat",
      baseUrl: "https://example.test/v1",
      defaultModel: "model-a",
      tags: ["draft", "fast"],
      encrypted: {
        ciphertext: "cipher",
        iv: "iv",
        tag: "tag",
      },
      storedInKeychain: false,
    });

    expect(listProviders(database)).toEqual([
      {
        id: "provider-1",
        label: "OpenAI Compatible",
        vendor: "openai-compat",
        baseUrl: "https://example.test/v1",
        defaultModel: "model-a",
        tags: ["draft", "fast"],
      },
    ]);

    const stored = getProviderPersistenceRecord(database, "provider-1");
    expect(stored).toMatchObject({
      encrypted: {
        ciphertext: "cipher",
        iv: "iv",
        tag: "tag",
      },
      keyStrategy: "single",
      cooldownMs: 60000,
    });

    updateProviderKeyStrategy(database, {
      id: "provider-1",
      keyStrategy: "round-robin",
      cooldownMs: 2500,
    });

    expect(getFirstProviderPersistenceRecord(database)).toMatchObject({
      id: "provider-1",
      keyStrategy: "round-robin",
      cooldownMs: 2500,
    });

    deleteProvider(database, "provider-1");
    expect(getProviderPersistenceRecord(database, "provider-1")).toBeNull();
  });
});
