# InkForge 验证报告

> 日期：2026-06-13
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
| `pnpm --filter @inkforge/desktop run e2e` | 通过 | 8 条 Electron e2e 通过，包含本地写作闭环 |

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

本轮新增并通过 `apps/desktop/e2e/local-first-writing-loop.spec.ts`，覆盖：

- 项目元数据写入。
- 章节 Markdown 正文保存和读回。
- 人物、世界条目、素材、样本库创建和列表读回。
- 手动快照创建和快照正文读回。
- 章节日志写入和列表读回。
- 项目 Markdown 导出到指定路径。
- 窗口重载后章节标题仍可见。

详细产品验证结论见 [InkForge 产品价值验证报告](product-validation-report.md)。

## 运行环境记录

- 操作系统：Windows
- Node.js：v24.11.1
- 包管理器：pnpm 9
- 桌面构建：Electron Vite
- SQLite 原生模块：`better-sqlite3`

本地验证期间曾遇到 `better-sqlite3` ABI 不匹配：native 模块处于 Electron ABI 128 时，Node 24 侧的 `pnpm test`/`verify:all` 需要 ABI 137，会报 `NODE_MODULE_VERSION 128` 与 `137` 不匹配。执行 `pnpm --filter @inkforge/desktop run sqlite:node` 后，Node 侧单测和 verify 全量通过。该失败属于本地原生模块状态问题，不是 TypeScript 或业务逻辑回归。

验证结束前已执行 `pnpm --filter @inkforge/desktop run sqlite:electron`，把本地 `better-sqlite3` 切回 Electron ABI，避免影响后续启动桌面开发版和 Electron e2e。

## 还不能证明的内容

以下内容没有在本轮验证中完成，不能写成已证明：

- 真实用户能否在 30 分钟内独立完成第一章写作闭环。
- AutoWriter 在真实模型上的输出质量、保留率、人物一致性和世界观一致性。
- 与普通 AI 聊天窗口相比，真实写作耗时和上下文整理成本是否明显下降。
- Windows/macOS/Linux 安装包在干净机器上的首次启动、升级和卸载体验。
- 长时间写作、异常断电、数据库损坏、复杂项目迁移等压力场景。

## 下一轮应该验证

1. 用 3 个固定样例项目跑 AutoWriter 输出评分：大纲遵循、人物一致、世界观一致、前文承接、可读性、可编辑性、排版。
2. 做一条端到端写作闭环：新建项目、创建人物/世界观、写章节、AutoWriter 续写、审查、快照、导出、重启恢复。
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
pnpm --filter @inkforge/desktop run e2e
```
