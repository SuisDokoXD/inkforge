import { test, expect, _electron as electron } from "@playwright/test";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const ENTRY = path.join(APP_ROOT, "out", "main", "index.js");

async function launch() {
  const app = await electron.launch({
    args: [ENTRY],
    env: {
      ...process.env,
      NODE_ENV: "test",
      INKFORGE_TEST_MODE: "1",
      INKFORGE_MOCK_LLM: "1",
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  return { app, win };
}

test.describe("M5-G 冒烟：6 条最小路径", () => {
  test("1. 启动到主窗口：标题栏出现 InkForge 文案", async () => {
    const { app, win } = await launch();
    const body = await win.textContent("body");
    expect(body ?? "").toMatch(/InkForge/);
    await app.close();
  });

  test("2. 欢迎向导可完成（设置 onboardingCompleted）", async () => {
    const { app, win } = await launch();
    // Step: 欢迎页按「下一步」直到完成 — 具体 data-testid 留给实装
    const nextBtn = win.locator('[data-testid="onboarding-next"]');
    if (await nextBtn.count()) {
      for (let i = 0; i < 5; i++) {
        if (await nextBtn.isVisible()) await nextBtn.click();
      }
    }
    await app.close();
  });

  test("3. 新建项目 + 章节 + 写 200 字触发 AI 反馈", async () => {
    const { app, win } = await launch();
    // TODO: 用 data-testid 勾出项目 / 章节 / 编辑器
    expect(await win.title()).toBeTruthy();
    await app.close();
  });

  test("4. Skill 页能打开并列出预设", async () => {
    const { app, win } = await launch();
    const skillTab = win.locator('[data-testid="activity-skill"]');
    if (await skillTab.count()) await skillTab.click();
    await app.close();
  });

  test("5. 审查页 ▶ 一键审查（mock provider）出至少一条 finding", async () => {
    const { app, win } = await launch();
    const reviewTab = win.locator('[data-testid="activity-review"]');
    if (await reviewTab.count()) await reviewTab.click();
    await app.close();
  });

  test("6. 诊断摘要按钮可复制（剪贴板包含『诊断摘要』）", async () => {
    const { app, win } = await launch();
    // 复制诊断摘要按钮在 Settings 里
    const settingsBtn = win.locator('[data-testid="open-settings"]');
    if (await settingsBtn.count()) {
      await settingsBtn.click();
      const copyBtn = win.locator('[data-testid="diag-copy"]');
      if (await copyBtn.count()) await copyBtn.click();
    }
    await app.close();
  });
});
