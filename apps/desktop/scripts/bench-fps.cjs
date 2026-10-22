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

  // 主进程的 stderr 是唯一能解释「窗口还没出来进程就没了」的地方：单实例锁、
  // DB 打不开、启动迁移失败都只在这里留话，而 playwright 只会报一句
  // "Target page, context or browser has been closed"。攒着，失败时打出来。
  const mainLog = [];
  app.process().stderr?.on("data", (chunk) => mainLog.push(String(chunk)));
  app.process().stdout?.on("data", (chunk) => mainLog.push(String(chunk)));

  let page;
  try {
    page = await app.firstWindow();
  } catch (err) {
    const tail = mainLog.join("").split("\n").filter(Boolean).slice(-25).join("\n");
    console.error("拿不到窗口。主进程输出（最后 25 行）：\n" + (tail || "<主进程没有任何输出>"));
    console.error(
      [
        "",
        "常见原因：",
        "  1) 已有 InkForge 实例在跑 —— 单实例锁让新进程立刻退出，先彻底关掉（含托盘/后台进程）；",
        "  2) 用户档案里残留 session.lock（上次非正常退出）；",
        "  3) 该档案的 SQLite 打不开（路径不存在 / 被别的实例占用）。",
        "原始错误：" + (err && err.message ? err.message : String(err)),
      ].join("\n"),
    );
    await app.close().catch(() => {});
    process.exit(2);
  }

  // 启动后不一定是编辑器：档案里「上次打开的书」可能为空（换过机器、清过状态、
  // 或刚复制档案），那时写作页是空的——0 章、没有 .ProseMirror。先在书籍下拉里
  // 选一本，再等编辑器出现，否则 bench 会把这些情况都误报成「档案停在引导页」。
  const editorCount = async () => page.locator(".ProseMirror").count();
  try {
    if ((await editorCount()) === 0) {
      const books = await page.evaluate(() => {
        const sel = document.querySelector("select");
        return sel ? [...sel.options].map((o) => ({ value: o.value, text: o.text })) : [];
      });
      const book = books.find((item) => item.value);
      if (book) {
        console.log(`未打开任何书，选用「${book.text}」`);
        await page.selectOption("select", book.value);
        await page.waitForTimeout(2500);
      }
    }
    await page.waitForSelector(".ProseMirror", { timeout: 90_000 });
  } catch {
    const snippet = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "<unavailable>");
    console.error("没找到编辑器（档案可能停在引导页，或选中的书没有章节）：\n" + snippet);
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

  // 阶段拆分：CDP 的 Performance 计数器给出脚本/样式/布局各花了多少，
  // 补上「帧率掉了，但掉在哪个阶段」这一层。计数器是累计值，取差即本次输入的开销。
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => {
    const { metrics: list } = await cdp.send("Performance.getMetrics");
    return Object.fromEntries(list.map((m) => [m.name, m.value]));
  };

  const text = SAMPLE.repeat(TYPE_REPEAT);
  await page.click(".ProseMirror");
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text.slice(0, 40), { delay: 20 }); // 预热，排除首帧与 JIT
  await page.waitForTimeout(600);

  const before = await metrics();
  await page.evaluate(install);
  const t0 = Date.now();
  await page.keyboard.type(text, { delay: 0 });
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(400);
  stats(`连续输入 ${text.length} 字（${elapsed}ms）`, ...(await page.evaluate(collect)));
  const after = await metrics();

  const d = (k) => ((after[k] ?? 0) - (before[k] ?? 0)) * 1000;
  const perKey = (k) => (d(k) / text.length).toFixed(2);
  console.log(
    `\n阶段拆分：脚本 ${d("ScriptDuration").toFixed(0)}ms(${perKey("ScriptDuration")}ms/键) · ` +
    `样式 ${d("RecalcStyleDuration").toFixed(0)}ms(${perKey("RecalcStyleDuration")}ms/键, ${Math.round((after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0))} 次) · ` +
    `布局 ${d("LayoutDuration").toFixed(0)}ms(${perKey("LayoutDuration")}ms/键, ${Math.round((after.LayoutCount ?? 0) - (before.LayoutCount ?? 0))} 次) · ` +
    `任务总计 ${d("TaskDuration").toFixed(0)}ms · 主线程占用 ${((d("TaskDuration") / elapsed) * 100).toFixed(0)}%`,
  );

  await app.close();
  console.log("\n>25ms = 跌倒 1.5 帧以上；>50ms = 肉眼可见顿挫。同一构建建议跑 2–3 次看分布。");
  process.exit(0);
})().catch((err) => {
  console.error("采样失败：", err && err.message ? err.message : err);
  process.exit(1);
});
