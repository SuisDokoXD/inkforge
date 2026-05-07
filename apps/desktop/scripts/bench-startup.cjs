#!/usr/bin/env node
/**
 * M9 Phase 0 bench-startup
 *
 * Times the Electron startup phases. Runs a headless Electron, marks:
 *   t0  process start
 *   t1  app.whenReady
 *   t2  window ready-to-show (= first visible paint baseline)
 *   t3  webContents did-finish-load
 *
 * Use this as a regression baseline before/after M9 perf work.
 *
 * Usage:
 *   node scripts/_run-in-electron.cjs scripts/bench-startup.cjs
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");

const t0 = Date.now();

if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

(async () => {
  await app.whenReady();
  const t1 = Date.now();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../out/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let t2 = 0;
  win.once("ready-to-show", () => {
    t2 = Date.now();
  });

  await win.loadFile(path.join(__dirname, "../out/renderer/index.html"));
  const t3 = Date.now();

  // give ready-to-show a chance if not already fired
  await new Promise((r) => setTimeout(r, 200));
  if (!t2) t2 = Date.now();

  console.log(JSON.stringify({
    bench: "startup",
    timings_ms: {
      "process-start -> whenReady": t1 - t0,
      "whenReady -> ready-to-show": t2 - t1,
      "whenReady -> did-finish-load": t3 - t1,
      "process-start -> did-finish-load": t3 - t0,
    },
  }, null, 2));

  win.close();
  app.quit();
})().catch((err) => {
  console.error(err);
  app.exit(1);
});
