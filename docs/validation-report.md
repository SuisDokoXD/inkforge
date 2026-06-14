# InkForge 验证报告

> 日期：2026-06-14
> 范围：本地机器可复现的工程质量门、存储迁移、核心纯逻辑验证、桌面端构建验证。

## 结论

本轮验证能证明：当前仓库可以通过 TypeScript 契约检查、跨包单元测试、生产构建，以及项目自带的桌面端 verify 脚本。它证明的是工程基线和核心逻辑没有明显断裂，不等同于证明真实用户体验、真实模型输出质量或跨平台安装包体验已经成熟。

## 本次通过的检查

| 检查 | 结果 | 说明 |
|---|---|---|
| `pnpm typecheck` | 通过 | 10 个 workspace 包，19 个 Turbo 任务成功 |
| `pnpm test` | 通过 | 10 个 workspace 包，18 个 Turbo 任务成功 |
| `pnpm build` | 通过 | 10 个 workspace 包成功；desktop 执行了实际 `electron-vite build` |
| `pnpm --filter @inkforge/desktop run sqlite:node` | 通过 | 将 `better-sqlite3` 切换到当前 Node ABI |
| `pnpm --filter @inkforge/desktop run verify:all` | 通过 | 桌面端迁移、引擎、模型服务、导出、RAG、快捷键等守门脚本通过 |
| `pnpm --filter @inkforge/desktop run sqlite:electron` | 通过 | 将 `better-sqlite3` 切回 Electron ABI |
| `pnpm --filter @inkforge/desktop run e2e` | 通过 | 9 条源码入口 Electron e2e 通过，packaged UI spec 在未设置环境变量时跳过 |
| `pnpm --filter @inkforge/desktop exec electron-builder --dir --config.directories.output=release-verify-20260614-0005 --publish never` | 通过 | 生成 Windows unpacked 目录版到独立验证目录 |
| Windows unpacked 启动 smoke | 通过 | `InkForge.exe` 用独立 `user-data-dir` 启动，8 秒后进程仍存活，并生成 workspace 数据库 |
| `pnpm --filter @inkforge/desktop run e2e:packaged` | 通过 | Playwright 通过 CDP 连接 Windows unpacked `InkForge.exe`，断言真实 packaged renderer、preload API 和 workspace 数据库 |

## verify:all 覆盖范围

`verify:all` 本轮确认了以下关键路径：

- 迁移：首次回放 27 个迁移，二次回放 0 个迁移；42 张期望表、48 个期望索引存在。
- Tavern 纯逻辑：预算估算、压缩判断、上下文构建。
- Review 纯逻辑：内置审查维度、LLM findings 解析、报告汇总、原文定位。
- 模型服务适配：Anthropic、OpenAI、Gemini、OpenAI-compatible registry 和 SSE/错误处理。
- i18n：180 个资源键，zh/en/ja 三语完整，常用占位符一致。
- Provider catalog：22 个模型服务条目可实例化。
- AutoWriter：findings 解析、重写触发、agent binding、planner/writer/critic prompt 拼装。
- Scene Binding：基础/高级绑定表、默认设置、模式隔离。
- RAG：样本库、世界条目、人物、资料笔记检索和跨项目隔离。
- World Relationship：关系约束、跨项目拒绝、自链接拒绝、孤儿关系清理。
- Export：ZIP/EPUB 条目顺序、压缩和内容 round-trip。
- Outline Generation：项目元数据、总纲快照、章节大纲卡 CRUD。
- Skill：技能存储、模板渲染、触发调度。
- Shortcuts：17 个导航快捷键与 UI 声明一致。

## e2e 覆盖范围

本轮默认 Electron e2e 是源码入口测试：9 条通过，`packaged-ui.spec.ts` 在未设置环境变量时跳过。新增重点包括 `apps/desktop/e2e/local-first-writing-loop.spec.ts`、`apps/desktop/e2e/auto-writer-mock.spec.ts` 和单独运行的 `apps/desktop/e2e/packaged-ui.spec.ts`。

`local-first-writing-loop.spec.ts` 覆盖：

- 项目元数据写入。
- 章节 Markdown 正文保存和读回。
- 人物、世界条目、素材、样本库创建和列表读回。
- 手动快照创建和快照正文读回。
- 章节日志写入和列表读回。
- 项目 Markdown 导出到指定路径。
- 窗口重载后章节标题仍可见。

`auto-writer-mock.spec.ts` 覆盖：

- `INKFORGE_MOCK_LLM=1` 下，主进程模型运行时返回确定性流式响应。
- AutoWriter 真实 IPC 入口启动，Planner/Writer/Critic/Reflector 经过同一条主进程流水线。
- 自动写作正文写入章节文件。
- AutoWriter 快照、章节日志和 token 统计落库。
- Review 真实 IPC 入口使用 mock LLM 生成 finding，并完成报告汇总。
- 重载后生成章节仍可见。

`packaged-ui.spec.ts` 覆盖：

- 通过真实 Windows unpacked `InkForge.exe` 启动应用，而不是源码 `out/main/index.js`。
- 使用 `--remote-debugging-port` 暴露本地 DevTools 端口，再用 Playwright `chromium.connectOverCDP` 连接真实 packaged renderer。
- 断言页面 URL 来自 `resources/app.asar/out/renderer/index.html`。
- 断言主界面出现 `InkForge` 文案。
- 断言 preload 注入的 `window.inkforge` 可用。
- 断言独立 appdata 下生成 `workspace/inkforge.db`。

详细产品验证结论见 [InkForge 产品价值验证报告](product-validation-report.md)。

## 打包产物验证

本轮没有覆盖安装器安装/卸载，也没有覆盖干净机器。已验证的是 Windows unpacked 目录版：

- 输出目录：`apps/desktop/release-verify-20260614-0005/win-unpacked`
- 主程序：`InkForge.exe`
- 大小：186,328,576 bytes
- SHA-256：`cb3e6d7ac3c5582fae609ebe7412d4e82d0d990fe88ec5506adbf0144d730dc0`

启动验证使用独立 appdata：

```text
output/visual-audit/dist-dir-launch-verify/appdata
```

结果：系统方式启动 `InkForge.exe`，8 秒后进程仍存活，随后关闭；appdata 下生成了 `workspace/inkforge.db`。这证明 unpacked 目录版在本机可以启动到稳定运行状态。

packaged UI 自动化使用独立 appdata：

```text
output/playwright/packaged-ui/appdata
```

结果：Playwright 通过 CDP 连接 `InkForge.exe` 的真实 renderer，确认页面来自 `resources/app.asar/out/renderer/index.html`，主界面出现 `InkForge`，preload API 可用，并生成 workspace 数据库。之前直接用 Playwright Electron driver 挂载 packaged `InkForge.exe` 会触发 renderer `page crashed`；本轮改为“系统启动 packaged exe + CDP 连接 renderer”，避免把源码入口测试误当成打包产物测试。

## 运行环境记录

- 操作系统：Windows
- Node.js：v24.11.1
- 包管理器：pnpm 9
- 桌面构建：Electron Vite
- SQLite 原生模块：`better-sqlite3`

本地验证期间曾遇到 `better-sqlite3` ABI 不匹配：native 模块处于 Electron ABI 128 时，Node 24 侧的 `pnpm test`/`verify:all` 需要 ABI 137，会报 `NODE_MODULE_VERSION 128` 与 `137` 不匹配。执行 `pnpm --filter @inkforge/desktop run sqlite:node` 后，Node 侧单测和 verify 全量通过。该失败属于本地原生模块状态问题，不是 TypeScript 或业务逻辑回归。

验证结束前已执行 `pnpm --filter @inkforge/desktop run sqlite:electron`，把本地 `better-sqlite3` 切回 Electron ABI，避免影响后续启动桌面开发版、Electron e2e 和打包产物。

## 还不能证明的内容

以下内容没有在本轮验证中完成，不能写成已证明：

- 真实用户能否在 30 分钟内独立完成第一章写作闭环。
- AutoWriter 在真实模型上的长期长文质量稳定性、保留率、人物一致性和世界观一致性；本轮已完成一条固定短样例烟测和一次 3 章连续 smoke，但还没有覆盖多题材、多模型和人工保留率评分。
- 与普通 AI 聊天窗口相比，真实写作耗时和上下文整理成本是否明显下降。
- Windows/macOS/Linux 安装包在干净机器上的首次启动、升级和卸载体验；本轮只验证了本机 Windows unpacked 目录版进程级启动。
- 长时间写作、异常断电、数据库损坏、复杂项目迁移等压力场景。

## 下一轮应该验证

1. 用 3 个不同题材的固定样例项目跑 AutoWriter 输出评分：大纲遵循、人物一致、世界观一致、前文承接、可读性、可编辑性、排版。
2. 给真实模型长篇连续 smoke 增加人工评分：每章可保留比例、需要修改的明显错误数、严重 OOC 数、世界观违例数。
3. 与普通 AI 聊天窗口做同题对比：记录准备上下文耗时、明显设定错误、作者修改耗时、可保留字数比例。
4. 在打包产物上跑首次启动验证，而不是只验证源码开发环境。
5. 找 1-3 个真实或半真实用户试用，记录卡点和第二天是否愿意继续打开。

## 可复现命令

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @inkforge/desktop run sqlite:node
pnpm --filter @inkforge/desktop run verify:all
pnpm --filter @inkforge/desktop run sqlite:electron
pnpm --filter @inkforge/desktop run e2e
pnpm --filter @inkforge/desktop exec electron-builder --dir --config.directories.output=release-verify-20260614-0005 --publish never
$env:INKFORGE_RUN_PACKAGED_UI="1"; pnpm --filter @inkforge/desktop run e2e:packaged
```
