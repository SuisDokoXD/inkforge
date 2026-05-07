# Changelog

All notable changes to InkForge (墨炉) will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), adhering to [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — M9 · 体验打磨与社区生态

聚焦三大用户痛点：性能慢 / 找不到功能 / 新用户上手难。无破坏性数据层变更。

### 🐛 修复

- **虚假快捷键**：ActivityBar tooltip 承诺的 `Ctrl+1~9 / Ctrl+0 / Ctrl+\`` 共 11 个快捷键此前仅 2 个真实绑定。新增 `lib/shortcuts.ts` 单一真源 + `useGlobalShortcuts` 在 App 层注册，13 个导航键全部生效；`Ctrl+\`` 回归 outline、终端切换迁至 `Ctrl+J`
- **新手引导一次性**：旧用户无法重看引导。SettingsDialog 增「重新观看新手引导」按钮，App 监听 `onboardingCompleted` 状态重入
- **i18n 缺漏**：ActivityBar label 和 "正在打开 InkForge…" 加载文案此前硬编码中文，发布英 / 日语会破。补 22 个 zh/en/ja 键

### 🚀 性能

- **路由级代码分割**：12 个非首屏页面（Skill / Character / Tavern / World / Outline / Research / Review / AutoWriter / Materials / Achievement / Letters / Bookshelf）改 `React.lazy + Suspense`，新增 `PageSkeleton` 占位
- **列表虚拟化**：引入 `@tanstack/react-virtual`；AI Timeline / 角色来信 / 章节树 改虚拟列表，千级条目滚动 60 fps
- **主进程启动**：vacuum scheduler / skill triggers / 预设 seed 全部推迟到 BrowserWindow 显示后的 `setImmediate`，缩短可见首屏延迟

### 🧭 信息架构

- **命令面板**（`cmdk`）：`Ctrl+K` 唤起；首版覆盖 13 个跳转 + 设置/Provider/终端 + 重玩引导/复制诊断；`lib/commands.ts` 声明式注册
- **ActivityBar 重组**：三组分隔（核心 / AI 协作 / 世界陪伴）+ 底部固定「⌘K + ⚙ 设置」工具栏；加 `role="tablist"` / `aria-current` 改善键盘可访问性

### ✅ 验收

- 新增 `verify-shortcuts.cjs`（接入 `verify:all`）：静态校验 ActivityBar 显示快捷键 ⊆ 已绑定，防回归
- 新增 `bench:startup` Electron 启动耗时基线脚本
- typecheck（18/18）+ verify:i18n（25）+ verify:catalog（22）+ verify:shortcuts（17）全过

### 📦 依赖

- `@tanstack/react-virtual` ^3.13
- `cmdk` ^1.1
- `lucide-react`（预备 Phase 3.3 emoji → SVG，未在本批次切换）

---

## [Unreleased] — M7 · Bookshelf Module

新增「书房」顶层模块，扩展 4 大能力，**完全旁路现有写作流程**：

### 🚀 新功能

- **📖 书房（多书并存）**：ActivityBar 新增书房入口；标签页同时打开多本书；首次进入显示书架网格选择；状态用 zustand persist 落 localStorage
- **🖼 书籍封面**：每本书可上传 PNG/JPG/WEBP/GIF 封面（≤2 MB），文件落 `<project>/.bookshelf/cover.<ext>`
- **📑 章节来源分类**：每章打 `ai-auto` / `ai-assisted` / `manual` 逻辑标签；书房按 origin 分 4 个 Tab 过滤；旧章节自动归入 `manual`
- **🤖 AutoWriter（多 Agent 全自动写小说）**：4 角色协作（Planner → Writer → Critic → Reflector）+ 共享上下文（人物档案 / 世界观 / 已写正文 / 用户介入）+ 段落级 OOC 守门员 + 单段重写上限；用户只需提供「思路 + 纠错」；默认统一模型，高级可为每个角色分别绑模型
- **📓 章节独立日志**：每章一份日志，触发方式 4 种：完成进度自动 / AutoWriter 运行结束自动 / 手动随时记录 / 每日 12:00 提醒；日志条目可由用户或 AI 写入
- **↶ 章节快照（撤回 AI 修改）**：每段 AI 写完前后自动打快照（pre-ai / post-ai）；用户可手动备份命名快照；还原时再打 `pre-restore` 快照让还原本身也可撤；自动快照保留最近 50 条，手动快照永不清理

### 🆕 数据层（迁移 v14，6 张新表）

`book_covers` / `chapter_origin_tags` / `chapter_logs` / `chapter_log_entries` / `chapter_snapshots` / `auto_writer_runs`，配套 8 个新索引；现有 13 个迁移与 20 张旧表零修改。

### 🆕 包

- `@inkforge/auto-writer-engine`（与 `tavern-engine` 平级）：纯逻辑层，DI 接入；导出 `runAutoWriterPipeline / parseFindings / shouldRewriteFromFindings / makeRoleResolver / buildPlanner|Writer|Critic|ReflectorUser` 等

### 🆕 IPC（24 request + 5 event）

`bookshelf:list-books` · `book-cover:upload/get/delete` · `origin-tag:set/get/list-by-origin` · `chapter-log:list/append-manual/append-ai/delete` · `auto-writer:start/stop/pause/resume/get-run/list-runs/inject-idea/correct` · `snapshot:create/list/get/restore/delete` · `auto-writer:chunk/phase/done/snapshot` · `chapter-log:daily-reminder`

### 🧪 验收

- 新增 `verify:auto-writer`（41 断言：findings parse 容错 8 / 重写阈值 6 / 计数 3 / markdown 渲染 5 / role resolver 8 / prompt builder 11）
- `verify:migrations` 升级到 26 表 + 30 索引 + 14 版本
- `verify:all` 包含全部 7 个 suite

### 📦 文件布局

`<project>/.bookshelf/cover.<ext>` 与 `<project>/.history/snapshots/<chapId>/<id>.md`——与现有 `chapters/`、`.history/.autosave-*.md` 物理隔离，零冲突。

### 🔒 兼容

- 旧用户数据 100% 兼容：迁移仅 `CREATE IF NOT EXISTS`，旧章节没 origin tag 自动按 `manual` 渲染
- 现有所有 IPC channel、表、UI 组件、Quick Action、Skill / Tavern / Review 流程零修改

---

## [0.1.0-beta.0] — 2026-04-21

First public beta. Core writing flow + AI collaboration + release infra complete.

### 🎯 本次重点

从 "本地 Markdown 编辑器" 升级到 "可 Beta 发布的 AI 协作写作台"：编辑器 + 5 触发 Skill + 多 AI 酒馆 + 5 维度全文审查 + 4 provider 资料检索 + 每日总结 + 多 Key 轮询 + 欢迎向导 + 诊断摘要 + 自动更新 + Skill 市场 MVP。

### 🚀 新功能

- **M0–M2**：Electron + TipTap + 200 字静默分析 + 多 provider（Claude/OpenAI/Gemini/OpenAI 兼容）+ 每日进度
- **M3-A Outline / Skill schema**
- **M3-B Skill 引擎**：5 种触发（selection / every-n-chars / on-save / on-chapter-end / manual）+ 模板变量 + 5 条预设
- **M3-C 人物档案 + 酒馆角色卡 + 双向同步**
- **M3-D 酒馆**：多 AI 角色按议题讨论 + token 预算 + 摘要压缩
- **M4-B 全文审查**：5 builtin 维度 + Markdown 导出
- **M4-C 世界观设定库**
- **M4-D 资料检索**：Tavily / Bing / SerpAPI / LLM 综述 4 provider
- **M4-E 每日总结**：基于字数和最近章节生成 Markdown 日报
- **M4-F Provider 多 Key 轮询**：single / round-robin / weighted / sticky + cooldown
- **M5-A 开发者模式 + 诊断摘要**：菜单 / StatusBar 入口；API Key 自动脱敏
- **M5-B 欢迎向导**：五步 stepper（欢迎 / 工作目录 / Provider / 示例 / 完成）
- **M5-C 自动更新**：electron-updater + generic provider；未签名时降级为"访问下载页"
- **M5-D 打包矩阵**：win/mac/linux 三平台，GitHub Actions release workflow
- **M5-E Skill 市场**：拉取 registry + 一键安装 + 发布向导（skill.json + PR 说明）
- **M5-F 文档**：README + architecture.md + skill-authoring.md + release notes 模板 + 示例项目
- **M5-G E2E 冒烟**：Playwright + Electron driver，6 条骨架

### 🔐 安全

- 零上报：本应用不连接任何错误收集 / 使用数据端点；诊断摘要需用户主动复制，API Key 已脱敏
- API Key 本地存储：优先 OS Keychain（keytar），不可用时回退 AES-GCM 加密文件

### ✅ 验收

- `pnpm typecheck` 全绿（17/17）
- `pnpm --filter @inkforge/desktop run verify:all` 60 项自动断言全过
  - verify:migrations（5 项）
  - verify:engine（15 项）
  - verify:review-engine（40 项）

### 📦 下载

Win/Mac/Linux 未签名构建来自 GitHub Actions，运行时可能触发系统安全警告，请用户酌情允许。正式签名留待 0.1.0 稳定版。

---

## 模板（下次写这里）

## [Unreleased]

### 新功能
- **M6-D 持久化加固**
  - 编辑器双层落盘：DB 1.2s 防抖写之外新增 5s `<project>/.inkforge/autosave/<chapterId>.md` 旁挂；切换章节时 `chapter:autosave-peek` 检测残留并提供「恢复 / 丢弃」横幅
  - 主进程崩溃标记：`<userData>/session.lock` 启动写入、`before-quit` 清除；`uncaughtException` / `unhandledRejection` 写回 reason 供下次启动展示
  - 每周 VACUUM 调度器：状态持久化于 `<workspaceDir>/maintenance.json`，启动 30s 后判定 + 每 24h 重检；不到一周直接跳过
  - 性能基准脚本 `pnpm --filter @inkforge/desktop run bench:storage`：可调规模（默认 5×500×5），覆盖 list/get/update/feedback/vacuum

### 改进
### 修复
### 安全
### 破坏性变更

### Improvements
- Wired the curated provider catalog into onboarding and provider settings.
- Added preset-driven autofill for vendor/base URL/default model and model suggestions via datalist.
- Added validation for openai-compat providers to require a non-empty base URL before saving.

### Fixes
- Updated provider connection testing to instantiate providers via the runtime registry (`createProvider`) instead of forcing Anthropic.
- Provider test now supports vendor-aware checks and allows keyless openai-compat tests for local endpoints.
