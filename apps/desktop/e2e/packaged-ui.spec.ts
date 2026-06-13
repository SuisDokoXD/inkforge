import { test, expect, chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");
const AUDIT_DIR = path.join(REPO_ROOT, "output", "playwright", "packaged-ui");
const DEFAULT_WINDOWS_EXE = path.join(
  APP_ROOT,
  "release-verify-20260614-0005",
  "win-unpacked",
  "InkForge.exe",
);

test.describe("packaged UI smoke", () => {
  test.skip(
    !shouldRunPackagedUi(),
    "Set INKFORGE_RUN_PACKAGED_UI=1 or INKFORGE_PACKAGED_EXE to verify packaged UI.",
  );

  test("launches the packaged app and inspects the renderer through CDP", async () => {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const exePath = resolvePackagedExe();
    expect(fs.existsSync(exePath), `Packaged executable not found: ${exePath}`).toBeTruthy();

    const port = await findFreePort();
    const appData = path.join(AUDIT_DIR, "appdata");
    fs.mkdirSync(appData, { recursive: true });

    const appProcess = childProcess.spawn(
      exePath,
      [`--user-data-dir=${appData}`, `--remote-debugging-port=${port}`],
      {
        env: {
          ...process.env,
          APPDATA: appData,
          LOCALAPPDATA: appData,
          INKFORGE_TEST_MODE: "1",
          NODE_ENV: "test",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );

    let browser: Browser | null = null;
    try {
      await waitForCdpEndpoint(port, appProcess, 20_000);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const page = await firstRendererPage(browser, 20_000);
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("body")).toContainText("InkForge", { timeout: 20_000 });
      await expect
        .poll(() => page.evaluate(() => Boolean((window as typeof window & { inkforge?: unknown }).inkforge)))
        .toBeTruthy();
      await expect(page).toHaveURL(/resources\/app\.asar\/out\/renderer\/index\.html/);

      await page.screenshot({
        path: path.join(AUDIT_DIR, "packaged-ui.png"),
        fullPage: true,
      });

      expect(fs.existsSync(path.join(appData, "workspace", "inkforge.db"))).toBeTruthy();
    } finally {
      if (browser) await browser.close();
      await stopProcess(appProcess);
    }
  });
});

function shouldRunPackagedUi(): boolean {
  return process.env.INKFORGE_RUN_PACKAGED_UI === "1" || Boolean(process.env.INKFORGE_PACKAGED_EXE);
}

function resolvePackagedExe(): string {
  const configured = process.env.INKFORGE_PACKAGED_EXE;
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") return DEFAULT_WINDOWS_EXE;
  throw new Error("INKFORGE_PACKAGED_EXE is required on non-Windows platforms.");
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error("Failed to allocate a free local port."));
        }
      });
    });
  });
}

async function waitForCdpEndpoint(
  port: number,
  appProcess: childProcess.ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Packaged app exited before CDP was ready, exitCode=${appProcess.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
      lastError = new Error(`CDP responded with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for packaged app CDP endpoint: ${String(lastError)}`);
}

async function firstRendererPage(browser: Browser, timeoutMs: number): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = rendererPageFromContext(context);
      if (page) return page;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for packaged app renderer page.");
}

function rendererPageFromContext(context: BrowserContext): Page | null {
  return (
    context
      .pages()
      .find((page) => page.url().includes("resources/app.asar/out/renderer/index.html")) ?? null
  );
}

async function stopProcess(appProcess: childProcess.ChildProcess): Promise<void> {
  if (appProcess.exitCode !== null) return;
  appProcess.kill();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) return;
    await delay(100);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
