#!/usr/bin/env node
/**
 * Summarize ignored real-model proof JSON into a Markdown report.
 *
 * The report intentionally prints only aggregate metrics, provider labels,
 * failures, and pass/fail boundaries. It does not print generated story text
 * or API key values.
 */
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const outDir = path.join(repoRoot, "output", "playwright", "real-model-eval");
const outPath = path.join(outDir, "real-model-proof-summary.md");
const includeAll = process.argv.includes("--all");
const stdoutOnly = process.argv.includes("--stdout-only");

function readRuns() {
  if (!fs.existsSync(outDir)) return [];
  const files = fs
    .readdirSync(outDir)
    .filter((name) => /^(real-model-proof-suite|autowriter-proof-suite)-.*\.json$/.test(name))
    .map((name) => path.join(outDir, name))
    .map((filePath) => ({ filePath, stat: fs.statSync(filePath) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const selected = includeAll ? files : files.slice(0, 1);
  return selected.map(({ filePath }) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { filePath, data: parsed };
  });
}

function bullet(value) {
  return value && value.length > 0 ? value.join("\n") : "- 无";
}

function providerLines(aggregate) {
  const providers = Array.isArray(aggregate.selectedProviders)
    ? aggregate.selectedProviders
    : [];
  if (providers.length === 0) return ["- 未记录可用模型服务"];
  return providers.map(
    (item) =>
      `- ${item.label || item.id || "未命名服务"} · ${item.vendor || "unknown"} · ${item.model || "未记录模型"}`,
  );
}

function providerFailures(aggregate) {
  const tests = Array.isArray(aggregate.providerTests) ? aggregate.providerTests : [];
  return tests
    .filter((item) => !item.ok)
    .map(
      (item) =>
        `- ${item.label || item.providerId || "未命名服务"}：${item.error || "测试未通过"}`,
    );
}

function runSection(run) {
  const data = run.data;
  const aggregate = data.aggregate || {};
  const misses = Array.isArray(aggregate.autoWriterRequiredMisses)
    ? aggregate.autoWriterRequiredMisses
    : [];
  const forbidden = Array.isArray(aggregate.autoWriterForbiddenHits)
    ? aggregate.autoWriterForbiddenHits
    : [];
  const providerFailed = providerFailures(aggregate);
  const canProve = [];
  const cannotProve = [];

  if ((aggregate.autoWriterCompleted || 0) > 0) {
    canProve.push("AutoWriter 真实模型主链路可完成至少一个写作任务。");
  }
  if (aggregate.reviewCompleted) {
    canProve.push("Review 真实模型主链路可完成审查。");
  }
  if (aggregate.reviewExportOk) {
    canProve.push("Review Markdown 报告导出链路可用。");
  }
  if ((aggregate.providerCount || 0) >= 2) {
    canProve.push("本轮实际覆盖至少两个可用模型服务。");
  } else {
    cannotProve.push("多模型稳定性：本轮可用模型服务不足两个。");
  }
  if ((aggregate.autoWriterPassed || 0) < (aggregate.autoWriterCases || 0)) {
    cannotProve.push("所有题材严格通过机器规则：仍存在漏线索或机器规则未通过样例。");
  }
  cannotProve.push("真人作者满意度、人工修改耗时、长期长篇质量稳定性。");

  return [
    `## ${path.basename(run.filePath)}`,
    "",
    `- 文件：\`${path.relative(repoRoot, run.filePath).replace(/\\/g, "/")}\``,
    `- 运行时间：${data.runAt || "未记录"}`,
    `- 题材数：${data.config?.caseLimit ?? "未记录"}`,
    `- 模型服务数：${aggregate.providerCount ?? 0}`,
    `- AutoWriter：${aggregate.autoWriterCompleted ?? 0}/${aggregate.autoWriterCases ?? 0} completed，${aggregate.autoWriterPassed ?? 0}/${aggregate.autoWriterCases ?? 0} 机器规则通过`,
    `- AutoWriter 平均机器评分：${aggregate.avgAutoWriterScore ?? "未记录"}`,
    `- AutoWriter 平均估算保留率：${aggregate.avgAutoWriterRetainRatio ?? "未记录"}`,
    `- Review：${aggregate.reviewCompleted ? "completed" : "未完成"}，findings ${aggregate.reviewFindingCount ?? 0}，Markdown 导出 ${aggregate.reviewExportOk ? "通过" : "未通过"}`,
    `- 多模型边界：${aggregate.multiModelBoundary || "未记录"}`,
    "",
    "### 可用模型服务",
    ...providerLines(aggregate),
    "",
    "### 模型服务失败",
    bullet(providerFailed),
    "",
    "### 漏线索",
    bullet(misses.map((item) => `- ${item}`)),
    "",
    "### 禁忌命中",
    bullet(forbidden.map((item) => `- ${item}`)),
    "",
    "### 能证明",
    bullet(canProve.map((item) => `- ${item}`)),
    "",
    "### 不能证明",
    bullet(cannotProve.map((item) => `- ${item}`)),
    "",
  ].join("\n");
}

function main() {
  const runs = readRuns();
  const header = [
    "# InkForge 真实模型 Proof 汇总",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    includeAll
      ? "范围：汇总全部 real-model proof JSON。"
      : "范围：汇总最近一次 real-model proof JSON。使用 `--all` 可汇总全部。",
    "",
  ].join("\n");
  const body =
    runs.length === 0
      ? "未找到 `output/playwright/real-model-eval/real-model-proof-suite-*.json`。\n"
      : runs.map(runSection).join("\n");
  const markdown = `${header}${body}`;
  if (!stdoutOnly) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, markdown, "utf8");
  }
  process.stdout.write(markdown);
  if (!stdoutOnly) {
    process.stdout.write(`\n\n已写入：${outPath}\n`);
  }
}

main();
