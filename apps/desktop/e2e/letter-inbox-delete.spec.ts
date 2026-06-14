import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");
const ENTRY = path.join(APP_ROOT, "out", "main", "index.js");
const AUDIT_DIR = path.join(REPO_ROOT, "output", "visual-audit", "letter-inbox-delete");
const MOCK_PROVIDER_ID = "inkforge-mock";
const MOCK_MODEL = "inkforge-mock";

async function launch() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const appData = path.join(AUDIT_DIR, `appdata-${Date.now()}`);
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

test("generated letter can be deleted from the inbox detail pane", async () => {
  const { app, win } = await launch();

  try {
    await win.waitForFunction(() => Boolean(window.inkforge?.letter));

    const seeded = await win.evaluate(
      async ({ providerId, model }) => {
        const api = window.inkforge;
        await api.settings.set({ updates: { onboardingCompleted: true, theme: "paper" } });

        const project = await api.project.create({
          name: `Letter delete regression ${Date.now()}`,
          dailyGoal: 500,
        });
        const character = await api.novelCharacter.create({
          projectId: project.id,
          name: "Test Character",
          persona: "Careful and direct.",
          traits: { role: "inbox regression fixture" },
          backstory: "Created by the generated-letter delete regression test.",
        });
        const letter = await api.letter.generate({
          projectId: project.id,
          characterId: character.id,
          providerId,
          model,
          tone: "neutral",
        });

        localStorage.setItem(
          "inkforge-app-store",
          JSON.stringify({
            state: {
              currentProjectId: project.id,
              currentChapterId: null,
              mainView: "letters",
              rightPanel: "timeline",
              terminalHeight: 240,
              autoWriterConfig: null,
            },
            version: 1,
          }),
        );

        return {
          projectId: project.id,
          letterId: letter.id,
          subject: letter.subject,
        };
      },
      { providerId: MOCK_PROVIDER_ID, model: MOCK_MODEL },
    );

    await win.reload({ waitUntil: "domcontentloaded" });

    const row = win.getByText(seeded.subject).first();
    await expect(row).toBeVisible();
    await row.click();

    const deleteButton = win.locator('[data-testid="letter-delete-button"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    await expect(win.locator('[data-testid="letter-delete-cancel"]')).toBeVisible();
    await deleteButton.click();

    await expect(win.getByText(seeded.subject)).toHaveCount(0);
    const stillExists = await win.evaluate(async ({ projectId, letterId }) => {
      const letters = await window.inkforge.letter.list({ projectId });
      return letters.some((letter) => letter.id === letterId);
    }, seeded);
    expect(stillExists).toBe(false);
  } finally {
    await app.close();
  }
});
