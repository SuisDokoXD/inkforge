import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  insertChapter,
  insertOutline,
  insertProject,
  listOutlines,
  openDatabase,
  runMigrations,
  setAppSettings,
  upsertProvider,
  upsertSceneBinding,
  updateProjectMeta,
  type DB,
  type Keystore,
} from "@inkforge/storage";

const appContextRef = vi.hoisted(() => ({ current: null as null | { db: DB; workspaceDir: string } }));
const llmRuntimeMocks = vi.hoisted(() => ({
  resolveProviderRecord: vi.fn(),
  resolveApiKey: vi.fn(),
  streamText: vi.fn(),
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

vi.mock("../llm-runtime", () => llmRuntimeMocks);

vi.mock("../prompt-context/voice-profile-context", () => ({
  buildVoiceContext: vi.fn(() => ({ before: "" })),
}));

import { generateChapterOutlines } from "../outline-generation-service";

function outlineCard(title: string): { title: string; content: string } {
  return {
    title,
    content: [
      "本章功能：承接前章悬念并推进主线行动，让人物目标更加清楚。",
      "视角人物：主角在现场观察线索，同时与同伴发生简短冲突。",
      "开场落点：清晨的旧码头出现异常灯光，主角被迫提前出发。",
      "关键场景：潮湿仓库、破损船票、被擦掉姓名的登记册依次出现。",
      "冲突推进：守门人拒绝透露消息，同伴怀疑主角隐瞒旧事。",
      "情绪层次：从焦躁到迟疑，再落到必须亲自确认真相的决心。",
      "结尾钩子：登记册最后一页露出熟悉笔迹，把下一章推向灯塔。",
    ].join("\n"),
  };
}

async function* streamJson(text: string): AsyncIterable<{ type: "delta" | "done"; textDelta?: string }> {
  yield { type: "delta", textDelta: text };
  yield { type: "done" };
}

describe("generateChapterOutlines", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-outline-gen-"));
    db = openDatabase({ workspaceDir });
    runMigrations(db);
    appContextRef.current = { db, workspaceDir };

    llmRuntimeMocks.resolveProviderRecord.mockReturnValue({
      id: "outline-provider",
      label: "Outline Provider",
      vendor: "openai",
      baseUrl: "https://example.test/v1",
      defaultModel: "model-default",
      tags: [],
      encrypted: null,
      storedInKeychain: false,
      keyStrategy: "single",
      cooldownMs: 0,
    });
    llmRuntimeMocks.resolveApiKey.mockResolvedValue("mock-key");
  });

  afterEach(() => {
    llmRuntimeMocks.resolveProviderRecord.mockReset();
    llmRuntimeMocks.resolveApiKey.mockReset();
    llmRuntimeMocks.streamText.mockReset();
    appContextRef.current = null;
    if (db) db.close();
    if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("replaces stale unlinked cards while reusing chapter-linked cards", async () => {
    insertProject(db, {
      id: "project-1",
      name: "测试项目",
      path: join(workspaceDir, "project-1"),
    });
    updateProjectMeta(db, {
      id: "project-1",
      masterOutline: "一部四章中篇，围绕旧码头、灯塔和来信推进。",
    });
    setAppSettings(db, { sceneRoutingMode: "advanced" });
    upsertProvider(db, {
      id: "outline-provider",
      label: "Outline Provider",
      vendor: "openai",
      baseUrl: "https://example.test/v1",
      defaultModel: "model-default",
      tags: [],
      encrypted: null,
      storedInKeychain: false,
    });
    upsertSceneBinding(db, {
      mode: "basic",
      sceneKey: "outline_generation",
      providerId: "outline-provider",
      model: "outline-model",
    });

    insertChapter(db, {
      id: "chapter-1",
      projectId: "project-1",
      title: "第1章 · 旧码头",
      order: 0,
      filePath: "chapters/chapter-1.md",
    });
    insertChapter(db, {
      id: "chapter-2",
      projectId: "project-1",
      title: "第2章 · 灯塔",
      order: 1,
      filePath: "chapters/chapter-2.md",
    });
    insertOutline(db, {
      id: "linked-card-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      title: "旧第1章",
      content: "旧内容",
      status: "written",
      order: 0,
    });
    insertOutline(db, {
      id: "linked-card-2",
      projectId: "project-1",
      chapterId: "chapter-2",
      title: "旧第2章",
      content: "旧内容",
      status: "written",
      order: 1,
    });
    insertOutline(db, {
      id: "stale-pending-card",
      projectId: "project-1",
      title: "旧待写章",
      content: "应该被替换",
      status: "planned",
      order: 2,
    });

    llmRuntimeMocks.streamText.mockImplementation(() =>
      streamJson(
        JSON.stringify([
          outlineCard("第1章 · 新旧码头"),
          outlineCard("第2章 · 灯塔来信"),
          outlineCard("第3章 · 登记册"),
          outlineCard("第4章 · 天亮之前"),
        ]),
      ),
    );

    const result = await generateChapterOutlines({
      projectId: "project-1",
      targetCount: 4,
      replaceExisting: true,
    });

    const cards = listOutlines(db, "project-1");
    expect(llmRuntimeMocks.resolveProviderRecord).toHaveBeenCalledWith("outline-provider");
    expect(result.cardIds).toHaveLength(4);
    expect(cards.map((card) => card.id)).not.toContain("stale-pending-card");
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.order)).toEqual([0, 1, 2, 3]);
    expect(cards[0]).toMatchObject({
      id: "linked-card-1",
      chapterId: "chapter-1",
      status: "written",
      title: "第1章 · 新旧码头",
    });
    expect(cards[1]).toMatchObject({
      id: "linked-card-2",
      chapterId: "chapter-2",
      status: "written",
      title: "第2章 · 灯塔来信",
    });
    expect(cards.slice(2).map((card) => card.chapterId)).toEqual([null, null]);
    expect(cards.slice(2).map((card) => card.status)).toEqual(["planned", "planned"]);
    expect(cards.slice(2).map((card) => card.title)).toEqual([
      "第3章 · 登记册",
      "第4章 · 天亮之前",
    ]);
  });
});
