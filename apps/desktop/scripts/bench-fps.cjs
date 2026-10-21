#!/usr/bin/env node
/**
 * bench:fps —— 真实窗口里的打字帧率采样
 *
 * 为什么需要它：打字卡顿来自主线程上的同步计算，typecheck、单测、
 * verify 脚本都看不见。这个脚本启动真实 Electron 窗口，在编辑器里连续输入，
 * 用 requestAnimationFrame 间隔 + PerformanceObserver(longtask) 量化掉帧。
 *
 * 需要一个已有项目的用户档案目录（否则会停在引导页，找不到编辑器）：
 *
 *   # PowerShell
 *   $env:INKFORGE_BENCH_USERDATA="D:\path\to\userdata"; pnpm --filter @inkforge/desktop bench:fps
 *   # bash
 *   INKFORGE_BENCH_USERDATA=/path/to/userdata pnpm --filter @inkforge/desktop bench:fps
 *
 * 前置：先 `pnpm --filter @inkforge/desktop build`，且 better-sqlite3 为 Electron ABI
 * （`pnpm --filter @inkforge/desktop sqlite:electron`）。
 *
 * 判读：>25ms 的帧 = 跌倒 1.5 帧以上；>50ms = 肉眼可见顿挫。p95 是最有用的单指标。
 */
const path = require("path");

const DESKTOP = path.join(__dirname, "..");
const USERDATA = process.env.INKFORGE_BENCH_USERDATA;
const SAMPLE = "雨停在子时。他摸到门边的伞，才发现伞骨已经折了一根。";
const TYPE_REPEAT = 12;

function stats(label, deltas, longTasks) {
  if (!deltas.length) {
    console.log(`${label}: 无帧样本`);
    return;
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const dropped = deltas.filter((d) => d > 25).length;
  const severe = deltas.filter((d) => d > 50).length;
  const total = longTasks.reduce((a, b) => a + b, 0);
  console.log(
    `${label}: ${deltas.length} 帧 | 平均 ${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)}ms ` +
      `p50 ${pct(0.5).toFixed(1)}ms p95 ${pct(0.95).toFixed(1)}ms 最大 ${Math.max(...deltas).toFixed(1)}ms | ` +
      `>25ms ${dropped} 帧 (${((dropped / deltas.length) * 100).toFixed(1)}%) >50ms ${severe} 帧 | ` +
      `longtask ${longTasks.length} 次 合计 ${total.toFixed(0)}ms`,
  );
}

(async () => {
  if (!USERDATA) {
    console.error("缺少 INKFORGE_BENCH_USERDATA（需要指向一个已有项目的用户档案目录）");
    process.exit(2);
  }
  let _electron;
  try {
    ({ _electron } = require(path.join(DESKTOP, "node_modules/@playwright/test")));
  } catch {
    console.error("找不到 @playwright/test，请先在仓库根目录安装依赖");
    process.exit(2);
  }

  const app = await _electron.launch({
    args: [path.join(DESKTOP, "out/main/index.js"), "--no-sandbox", `--user-data-dir=${USERDATA}`],
    cwd: DESKTOP,
    timeout: 90_000,
  });
  const page = await app.firstWindow();

  try {
    await page.waitForSelector(".ProseMirror", { timeout: 90_000 });
  } catch {
    const snippet = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "<unavailable>");
    console.error("没找到编辑器（档案可能停在引导页）：\n" + snippet);
    await app.close();
    process.exit(2);
  }

  const chars = await page.evaluate(() => document.querySelector(".ProseMirror").textContent.length);
  console.log(`编辑器就绪，当前章节 ${chars} 字\n`);

  const install = () => {
    window.__bench = { deltas: [], longTasks: [], running: true };
    let last = performance.now();
    const tick = (t) => {
      window.__bench.deltas.push(t - last);
      last = t;
      if (window.__bench.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__bench.longTasks.push(entry.duration);
      });
      po.observe({ entryTypes: ["longtask"] });
      window.__bench.po = po;
    } catch {
      /* longtask 不可用时不致命 */
    }
  };
  const collect = () => {
    window.__bench.running = false;
    if (window.__bench.po) window.__bench.po.disconnect();
    return [window.__bench.deltas, window.__bench.longTasks];
  };

  await page.evaluate(install);
  await page.waitForTimeout(1200);
  stats("空闲 1.2s", ...(await page.evaluate(collect)));

  await page.click(".ProseMirror");
  await page.keyboard.press("Control+End");
  const text = SAMPLE.repeat(TYPE_REPEAT);
  await page.evaluate(install);
  const t0 = Date.now();
  await page.keyboard.type(text, { delay: 0 });
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(400);
  stats(`连续输入 ${text.length} 字（${elapsed}ms）`, ...(await page.evaluate(collect)));

  await app.close();
  console.log("\n>25ms = 跌倒 1.5 帧以上；>50ms = 肉眼可见顿挫。同一构建建议跑 2–3 次看分布。");
  process.exit(0);
})().catch((err) => {
  console.error("采样失败：", err && err.message ? err.message : err);
  process.exit(1);
});
