#!/usr/bin/env node
/**
 * verify-typing-path
 *
 * 打字热路径守卫。EditorPane 里有若干「全文扫描」型派生值（字数、章节目录、
 * 段落聚焦、修订队列、成稿体检）。它们必须挂在 120ms 去抖快照 statsText 上，
 * 一旦改回逐键变化的 content，长章节每次按键就要多付 20ms+ 的同步计算，
 * 表现为输入卡顿、光标跟不上。
 *
 * 实测（30k 字章节，Node 24 / 同 V8）：countGraphemes 2.7ms、
 * buildManualParagraphFocusOverview 6.5ms、buildManualChapterHealthReport 12.1ms。
 *
 * 这类回归 typecheck 和单测都抓不到，所以在脚本层做文本断言。
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../src/renderer/src/components/EditorPane.tsx");

function fail(msg) {
  console.error("\u2717 " + msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("\u2713 " + msg);
}

function main() {
  if (!fs.existsSync(FILE)) {
    fail("EditorPane.tsx not found at " + FILE);
    return;
  }
  const src = fs.readFileSync(FILE, "utf8");

  // 1) 字数不得在逐键路径上做全文扫描
  if (/countGraphemes\(\s*content\s*\)/.test(src)) {
    fail("countGraphemes(content) 出现在按键路径上，应复用去抖后的 stats.graphemes");
  } else {
    ok("字数统计未在逐键路径上做全文扫描");
  }

  // 2) 五个展示型派生值必须以 statsText 为输入
  const derivations = [
    ["extractChapterHeadings", /extractChapterHeadings\([^)]*statsText\)/],
    ["extractManualChapterMap", /extractManualChapterMap\([^)]*statsText\)/],
    ["buildManualParagraphFocusOverview", /buildManualParagraphFocusOverview\(\s*statsText/],
    ["buildManualRevisionQueueItems", /buildManualRevisionQueueItems\([^)]*statsText\)/],
    ["buildManualChapterHealthReport", /buildManualChapterHealthReport\([^)]*statsText\)/],
  ];
  for (const [name, re] of derivations) {
    if (re.test(src)) ok(`${name} 跑在去抖快照上`);
    else fail(`${name} 不再以 statsText 为输入，可能退回逐键全文扫描`);
  }

  // 3) 展示型 useMemo 的依赖里不得出现裸 content（[chapter, content] 这种写法）
  const contentDeps = src.match(/\[\s*chapter,\s*content\s*\]/g);
  if (contentDeps) {
    fail(`发现 ${contentDeps.length} 处依赖数组含 [chapter, content]（展示型派生应改用 statsText）`);
  } else {
    ok("没有以 content 为依赖的展示型 useMemo");
  }

  // 4) 写作节律落盘必须限流
  if (!/MANUAL_RHYTHM_FLUSH_INTERVAL_MS/.test(src)) {
    fail("写作节律落盘缺少限流常量，可能每次按键都写 localStorage");
  } else {
    ok("写作节律落盘有限流");
  }
  if (/persistManualRhythmState\(/.test(src) && !/rhythmFlushRef\.current\.at < MANUAL_RHYTHM_FLUSH_INTERVAL_MS/.test(src)) {
    fail("persistManualRhythmState 未受限流守卫保护");
  } else {
    ok("persistManualRhythmState 受限流守卫保护");
  }

  // 5) 光标状态（行号 / 本段字数）必须节流。
  //
  // 这段文本挂在 editor 的 update / selectionUpdate 上，是 EditorPane 里唯一会真正
  // 落到 DOM 上的逐键变更——每键换一次文本就要重排一次工具栏。实测（312 键，同一
  // 章节）：不节流 布局 2.98ms/键、670 次布局；节流到 120ms 后 1.23ms/键、352 次，
  // 连脚本也从 4.47 降到 3.47ms/键（少一次 setState 整树重渲染）。
  if (!/CURSOR_STATE_THROTTLE_MS/.test(src)) {
    fail("光标状态缺少节流常量，可能每键重排工具栏");
  } else {
    ok("光标状态有节流常量");
  }
  if (/const updateCursorState = useCallback\(\(\) => \{\s*\n\s*if \(!editorInstance\)/.test(src)) {
    fail("updateCursorState 又变成每次调用都立即 setCursorState，节流失效");
  } else {
    ok("updateCursorState 走节流路径");
  }
  if (/cursorStateTimerRef\.current = window\.setTimeout/.test(src)) {
    ok("光标状态有末尾补调度（停笔后最终值会落上）");
  } else {
    fail("光标状态没有末尾补调度，最后一次变更可能丢失");
  }
}

main();
