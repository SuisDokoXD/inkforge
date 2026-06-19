import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWorldPackById,
  insertWorldPack,
  listWorldPackEntries,
  openDatabase,
  runMigrations,
  type DB,
  type Keystore,
} from "@inkforge/storage";

const appContextRef = vi.hoisted(() => ({
  current: null as null | { db: DB; workspaceDir: string },
}));

const runtimeMocks = vi.hoisted(() => ({
  resolveApiKey: vi.fn(),
  resolveProviderRecord: vi.fn(),
  streamText: vi.fn(),
  resolveSceneBinding: vi.fn(),
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

vi.mock("../llm-runtime", () => ({
  resolveApiKey: runtimeMocks.resolveApiKey,
  resolveProviderRecord: runtimeMocks.resolveProviderRecord,
  streamText: runtimeMocks.streamText,
}));

vi.mock("../scene-binding-service", () => ({
  resolveSceneBinding: runtimeMocks.resolveSceneBinding,
}));

import { fuseWorldPacks } from "../world-pack-fusion-service";

describe("fuseWorldPacks", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-world-pack-fusion-"));
    db = openDatabase({ workspaceDir });
    runMigrations(db);
    appContextRef.current = { db, workspaceDir };
    runtimeMocks.resolveApiKey.mockReset();
    runtimeMocks.resolveProviderRecord.mockReset();
    runtimeMocks.streamText.mockReset();
    runtimeMocks.resolveSceneBinding.mockReset();

    insertWorldPack(db, {
      id: "source-a",
      name: "源卡 A",
      tagline: "秩序",
      description: "第一张源卡",
    });
    insertWorldPack(db, {
      id: "source-b",
      name: "源卡 B",
      tagline: "云城",
      description: "第二张源卡",
    });
  });

  afterEach(() => {
    appContextRef.current = null;
    if (db) db.close();
    if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("persists the reviewed preview instead of asking the model for another version", async () => {
    const response = await fuseWorldPacks({
      sourcePackIds: ["source-a", "source-b"],
      brief: "保留源卡 A 的秩序感",
      persist: true,
      suggestion: {
        name: "云上秩序城",
        tagline: "被钟声约束的浮空城邦",
        description: "所有街区沿钟塔规则运行。",
        tags: ["融合", "浮空城"],
        entries: [
          {
            category: "地理",
            title: "中央钟塔",
            content: "钟塔决定云上城的昼夜与航线。",
            aliases: ["钟塔"],
            keys: ["中央钟塔", "云上城"],
          },
        ],
      },
    });

    expect(runtimeMocks.resolveSceneBinding).not.toHaveBeenCalled();
    expect(runtimeMocks.resolveProviderRecord).not.toHaveBeenCalled();
    expect(runtimeMocks.streamText).not.toHaveBeenCalled();

    expect(response.suggestion.name).toBe("云上秩序城");
    expect(response.pack).toMatchObject({
      name: "云上秩序城",
      origin: "fused",
      parentPackIds: ["source-a", "source-b"],
    });

    const savedPack = getWorldPackById(db, response.pack!.id);
    expect(savedPack).toMatchObject({
      name: "云上秩序城",
      tags: ["融合", "浮空城"],
    });

    expect(listWorldPackEntries(db, response.pack!.id)).toEqual([
      expect.objectContaining({
        category: "地理",
        title: "中央钟塔",
        content: "钟塔决定云上城的昼夜与航线。",
        aliases: ["钟塔"],
        keys: ["中央钟塔", "云上城"],
        order: 0,
      }),
    ]);
  });
});
