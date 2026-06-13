import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");
const ENTRY = path.join(APP_ROOT, "out", "main", "index.js");
const AUDIT_DIR = path.join(REPO_ROOT, "output", "visual-audit", "auto-writer-mock");
const MOCK_PROVIDER_ID = "inkforge-mock";
const MOCK_MODEL = "inkforge-mock";

async function launch() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const appData = path.join(AUDIT_DIR, "appdata");
  fs.mkdirSync(appData, { recursive: true });
  const app = await electron.launch({
    args: [ENTRY, `--user-data-dir=${appData}`],
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: appData,
      NODE_ENV: "test",
      INKFORGE_TEST_MODE: "1",
      INKFORGE_MOCK_LLM: "1",
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  return { app, win };
}

test("mock LLM drives AutoWriter and Review through the real main-process pipeline", async () => {
  const { app, win } = await launch();
  await win.waitForFunction(() => Boolean(window.inkforge?.autoWriter));

  const result = await win.evaluate(async ({ providerId, model }) => {
    const api = window.inkforge;
    await api.settings.set({ updates: { onboardingCompleted: true, theme: "paper" } });

    const project = await api.project.create({
      name: `AutoWriter mock 验证-${Date.now()}`,
      dailyGoal: 1500,
    });
    await api.outlineGen.updateProjectMeta({
      projectId: project.id,
      synopsis: "沈青禾在雨声茶馆追查师父失踪前留下的朱砂印。",
      genre: "悬疑",
      subGenre: "武侠",
      tags: ["AutoWriter", "mock"],
      globalWorldview: "雨声茶馆只在暴雨夜开门，消息必须用真实记忆交换。",
    });

    const chapter = await api.chapter.create({
      projectId: project.id,
      title: "朱砂印",
      filePath: "",
      wordCount: 0,
    });
    await api.novelCharacter.create({
      projectId: project.id,
      name: "沈青禾",
      persona: "谨慎、克制，习惯先观察再出剑。",
      traits: { goal: "追查师父失踪", taboo: "不轻信雨夜来客" },
      backstory: "青松门弟子，三年前师父失踪后一直独自查访。",
    });
    await api.world.create({
      projectId: project.id,
      category: "地点",
      title: "雨声茶馆",
      content: "只在暴雨夜开门，消息必须用真实记忆交换。",
      aliases: ["茶馆"],
      tags: ["舞台"],
      keys: ["雨声茶馆", "记忆茶资"],
      position: "before",
      probability: 100,
    });

    let autoWriterRunId = "";
    const autoWriterDone = new Promise<import("@inkforge/shared").AutoWriterDoneEvent>((resolve) => {
      const off = api.autoWriter.onDone((payload) => {
        if (!autoWriterRunId || payload.runId === autoWriterRunId) {
          off();
          resolve(payload);
        }
      });
    });
    const started = await api.autoWriter.start({
      projectId: project.id,
      chapterId: chapter.id,
      userIdeas: "沈青禾在雨声茶馆收到带朱砂印的信，阿迟知道送信人的线索。",
      agents: [
        {
          role: "writer",
          providerId,
          model,
          temperature: 0.2,
          maxTokens: 800,
        },
      ],
      targetSegmentLength: 180,
      maxSegments: 2,
      maxRewritesPerSegment: 0,
      enableOocGate: true,
      speedMode: "quality",
    });
    autoWriterRunId = started.runId;
    const done = await autoWriterDone;
    const finalChapter = await api.chapter.read({ id: chapter.id });
    const run = await api.autoWriter.getRun({ runId: started.runId });
    const snapshots = await api.snapshot.list({
      chapterId: chapter.id,
      runId: started.runId,
      limit: 20,
    });
    const logs = await api.chapterLog.list({ chapterId: chapter.id, limit: 10 });

    const dims = await api.reviewDim.list({ projectId: project.id });
    const dimensionIds = dims.slice(0, 1).map((dim) => dim.id);
    let reportId = "";
    const reviewDone = new Promise<import("@inkforge/shared").ReviewDoneEvent>((resolve) => {
      const off = api.review.onDone((payload) => {
        if (!reportId || payload.reportId === reportId) {
          off();
          resolve(payload);
        }
      });
    });
    const review = await api.review.run({
      projectId: project.id,
      rangeKind: "chapter",
      rangeIds: [chapter.id],
      dimensionIds,
      providerId,
      model,
    });
    reportId = review.reportId;
    const reviewFinished = await reviewDone;
    const reviewReport = await api.review.get({ reportId: review.reportId });

    localStorage.setItem(
      "inkforge-app-store",
      JSON.stringify({
        state: {
          currentProjectId: project.id,
          currentChapterId: chapter.id,
          mainView: "writing",
          rightPanel: "timeline",
          terminalHeight: 240,
          autoWriterConfig: null,
        },
        version: 1,
      }),
    );

    return {
      chapterId: chapter.id,
      chapterContent: finalChapter.content,
      done,
      runStatus: run?.status ?? null,
      snapshotCount: snapshots.length,
      logContents: logs.map((log) => log.content),
      reviewStatus: reviewFinished.status,
      reviewTotals: reviewFinished.summary?.totals ?? null,
      reviewFindingCount: reviewReport?.findings.length ?? 0,
    };
  }, { providerId: MOCK_PROVIDER_ID, model: MOCK_MODEL });

  expect(result.done.status).toBe("completed");
  expect(result.done.totalSegments).toBe(2);
  expect(result.done.totalTokensIn).toBeGreaterThan(0);
  expect(result.done.totalTokensOut).toBeGreaterThan(0);
  expect(result.runStatus).toBe("completed");
  expect(result.chapterContent).toContain("青松门独有的朱砂印");
  expect(result.chapterContent).toContain("真实记忆");
  expect(result.snapshotCount).toBeGreaterThanOrEqual(2);
  expect(result.logContents.some((content) => content.includes("AutoWriter completed"))).toBeTruthy();
  expect(result.reviewStatus).toBe("completed");
  expect(result.reviewFindingCount).toBeGreaterThanOrEqual(1);
  expect(result.reviewTotals?.info ?? 0).toBeGreaterThanOrEqual(1);

  await win.reload({ waitUntil: "domcontentloaded" });
  await expect(win.getByText("朱砂印").first()).toBeVisible();
  await win.screenshot({
    path: path.join(AUDIT_DIR, "auto-writer-mock.png"),
    fullPage: true,
  });

  await app.close();
});
