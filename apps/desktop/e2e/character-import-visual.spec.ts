import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");
const ENTRY = path.join(APP_ROOT, "out", "main", "index.js");
const AUDIT_DIR = path.join(REPO_ROOT, "output", "visual-audit", "character-import");

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

test("character page chapter import entry renders", async () => {
  const { app, win } = await launch();
  await win.waitForFunction(() => Boolean(window.inkforge?.project));

  const ids = await win.evaluate(async () => {
    const api = window.inkforge;
    await api.settings.set({ updates: { onboardingCompleted: true, theme: "paper" } });
    const project = await api.project.create({
      name: `人物识别视觉验证-${Date.now()}`,
      dailyGoal: 1000,
    });
    const chapter = await api.chapter.create({
      projectId: project.id,
      title: "雨夜来客",
      filePath: "",
      wordCount: 0,
    });
    const content = [
      "# 雨夜来客",
      "",
      "沈青禾推开茶馆的木门时，雨水正顺着她的发梢滴落。",
      "掌柜陆闻舟抬头看了她一眼，慢慢合上账本。",
      "角落里的少年阿迟抱着剑，像是早就等在这里。",
    ].join("\n");
    await api.chapter.update({
      id: chapter.id,
      content,
      wordCount: content.replace(/\s+/g, "").length,
    });
    localStorage.setItem(
      "inkforge-app-store",
      JSON.stringify({
        state: {
          currentProjectId: project.id,
          currentChapterId: chapter.id,
          mainView: "character",
          rightPanel: "timeline",
          terminalHeight: 240,
          autoWriterConfig: null,
        },
        version: 1,
      }),
    );
    return { projectId: project.id, chapterId: chapter.id };
  });

  await win.reload({ waitUntil: "domcontentloaded" });
  await expect(win.getByText("书中角色")).toBeVisible();
  await expect(win.getByRole("button", { name: "从章节识别人物" })).toBeVisible();
  await win.waitForTimeout(350);
  await win.screenshot({
    path: path.join(AUDIT_DIR, "character-page.png"),
    fullPage: true,
  });

  await win.getByRole("button", { name: "从章节识别人物" }).click();
  await expect(win.getByRole("dialog", { name: "从章节识别人物" })).toBeVisible();
  const chapterOptions = await win.getByLabel("章节").locator("option").allTextContents();
  expect(chapterOptions.some((text) => text.includes("雨夜来客"))).toBeTruthy();
  await win.waitForTimeout(350);
  await win.screenshot({
    path: path.join(AUDIT_DIR, "character-import-dialog.png"),
    fullPage: true,
  });

  await win.evaluate(({ projectId, chapterId }) => {
    localStorage.setItem(
      "inkforge-app-store",
      JSON.stringify({
        state: {
          currentProjectId: projectId,
          currentChapterId: chapterId,
          mainView: "research",
          rightPanel: "timeline",
          terminalHeight: 240,
          autoWriterConfig: null,
        },
        version: 1,
      }),
    );
  }, ids);
  await win.reload({ waitUntil: "domcontentloaded" });
  await expect(win.getByRole("heading", { name: "资料检索" })).toBeVisible();
  await expect(win.getByText("不联网，只帮你整理关键词")).toBeVisible();
  await win.waitForTimeout(350);
  await win.screenshot({
    path: path.join(AUDIT_DIR, "research-page.png"),
    fullPage: true,
  });

  await win.evaluate(({ projectId, chapterId }) => {
    localStorage.setItem(
      "inkforge-app-store",
      JSON.stringify({
        state: {
          currentProjectId: projectId,
          currentChapterId: chapterId,
          mainView: "tavern",
          rightPanel: "timeline",
          terminalHeight: 240,
          autoWriterConfig: null,
        },
        version: 1,
      }),
    );
  }, ids);
  await win.reload({ waitUntil: "domcontentloaded" });
  await expect(win.getByText("酒馆会话")).toBeVisible();
  await win.getByRole("button", { name: "+ 新建" }).click();
  await expect(win.getByText("玩法模板")).toBeVisible();
  await expect(win.getByText("冲突圆桌")).toBeVisible();
  await win.waitForTimeout(350);
  await win.screenshot({
    path: path.join(AUDIT_DIR, "tavern-new-session.png"),
    fullPage: true,
  });

  await app.close();
});
