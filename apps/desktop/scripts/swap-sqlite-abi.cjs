#!/usr/bin/env node
/**
 * better-sqlite3 原生 binding 的 ABI 切换 / 诊断助手。
 *
 * 背景：verify 脚本用系统 Node 运行（Node ABI），而 `pnpm dev` 跑在 Electron 里（Electron ABI）。
 * 同一个 better_sqlite3.node 不能同时服务两者，必须按场景重编。手动 prebuild-install 容易记错
 * target、或验证完忘了切回 Electron 导致 dev 崩。这个脚本把流程固化下来，并能先诊断再切换。
 *
 * 用法：
 *   node scripts/swap-sqlite-abi.cjs            # 诊断：报告当前 binding 在哪个 ABI（不改动）
 *   node scripts/swap-sqlite-abi.cjs node       # 切到 Node ABI（跑 verify 脚本前）
 *   node scripts/swap-sqlite-abi.cjs electron   # 切回 Electron ABI（跑 dev 前）
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

// 定位 better-sqlite3 安装目录（pnpm 下经由软链解析），prebuild-install 需在此目录执行。
function resolveBetterSqliteDir() {
  const pkgJson = require.resolve("better-sqlite3/package.json", {
    paths: [path.join(__dirname, "..")],
  });
  return path.dirname(pkgJson);
}

// 读取已安装 electron 的精确版本，作为 prebuild-install 的 --target。
function electronVersion() {
  const pkgJson = require.resolve("electron/package.json", {
    paths: [path.join(__dirname, "..")],
  });
  return require(pkgJson).version;
}

// 诊断：尝试在当前 Node 进程里实例化一个内存库。
// 能成功 → 当前 binding 是 Node ABI；抛 ERR_DLOPEN → 是 Electron ABI（或损坏）。
function detectCurrentAbi() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return "node";
  } catch (err) {
    if (err && err.code === "ERR_DLOPEN_FAILED") return "electron-or-broken";
    throw err;
  }
}

function rebuildFromSource(dir, runtime, version) {
  const args = [
    "node-gyp",
    "rebuild",
    `--runtime=${runtime}`,
    `--target=${version}`,
    `--arch=${process.arch}`,
  ];
  if (runtime === "electron") {
    args.push("--dist-url=https://electronjs.org/headers");
  }
  console.log(`[swap-sqlite-abi] 改用 node-gyp 从源码编译 ${runtime}@${version} …`);
  execFileSync("npx", args, {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

// 先尝试 prebuild-install；没有预编译包时自动降级到 node-gyp 源码编译。
function swap(target) {
  const dir = resolveBetterSqliteDir();
  const runtime = target; // "node" | "electron"
  const version = target === "electron" ? electronVersion() : process.versions.node;
  console.log(`[swap-sqlite-abi] 目录: ${dir}`);
  console.log(`[swap-sqlite-abi] 切换到 ${runtime} ABI（target=${version}, arch=${process.arch}）…`);
  try {
    execFileSync(
      "npx",
      ["prebuild-install", "-r", runtime, "-t", version, "--arch", process.arch],
      { cwd: dir, stdio: "inherit", shell: process.platform === "win32" },
    );
    console.log(`\x1b[32m[swap-sqlite-abi] 已切到 ${runtime} ABI。\x1b[0m`);
    return;
  } catch (err) {
    console.warn(
      `\x1b[33m[swap-sqlite-abi] 未找到 ${runtime}@${version} 的预编译包，尝试源码编译。\x1b[0m`,
    );
    try {
      rebuildFromSource(dir, runtime, version);
      console.log(`\x1b[32m[swap-sqlite-abi] 已切到 ${runtime} ABI。\x1b[0m`);
    } catch (rebuildErr) {
      console.error(
        `\x1b[31m[swap-sqlite-abi] 源码编译 ${runtime}@${version} 失败。\x1b[0m\n` +
          "  请确认已安装 node-gyp、Python 和 Visual Studio C++ 构建工具。",
      );
      process.exit(rebuildErr && typeof rebuildErr.status === "number" ? rebuildErr.status : 1);
    }
  }
}

function main() {
  const arg = process.argv[2];
  if (!arg || arg === "status") {
    const abi = detectCurrentAbi();
    if (abi === "node") {
      console.log("当前 binding：\x1b[36mNode ABI\x1b[0m —— 可跑 verify 脚本；跑 dev 前需 `node scripts/swap-sqlite-abi.cjs electron`。");
    } else {
      console.log("当前 binding：\x1b[36mElectron ABI\x1b[0m —— 可跑 dev；跑 verify 脚本前需 `node scripts/swap-sqlite-abi.cjs node`。");
    }
    return;
  }
  if (arg !== "node" && arg !== "electron") {
    console.error(`未知参数 "${arg}"。用法：swap-sqlite-abi.cjs [status|node|electron]`);
    process.exit(1);
  }
  swap(arg);
}

main();
