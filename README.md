<div align="center">

<img src="assets/banner.svg" alt="InkForge — 墨炉" width="100%" />

<p>
  <strong>本地优先的 AI 协作式桌面写作台 · A local-first AI writing forge for novelists</strong>
</p>

<p>
  <a href="https://github.com/tompignofind123-cyber/inkforge/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/tompignofind123-cyber/inkforge/ci.yml?branch=main&label=CI&logo=github" alt="CI"></a>
  <a href="https://github.com/tompignofind123-cyber/inkforge/releases"><img src="https://img.shields.io/github/v/release/tompignofind123-cyber/inkforge?include_prereleases&color=ff7e3d" alt="Release"></a>
  <img src="https://img.shields.io/badge/schema-v26-3aa676" alt="schema">
  <img src="https://img.shields.io/badge/ipc-221%20channels-3aa676" alt="ipc">
  <img src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-8a9bb8" alt="platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3a82f6" alt="license"></a>
  <img src="https://img.shields.io/badge/electron-32-9feaf9" alt="electron">
  <img src="https://img.shields.io/badge/data-100%25%20local-22c55e" alt="local-first">
</p>

<p>
  <a href="#-为什么用-inkforge">中文</a> ·
  <a href="#-why-inkforge">English</a> ·
  <a href="docs/architecture.md">架构</a> ·
  <a href="docs/skill-authoring.md">Skill 作者指南</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

</div>

---

## 🪶 为什么用 InkForge

写作工具链里「纯文本编辑器」与「AI 聊天」长期割裂——长篇作者跨章节查时间线、要人物口吻一致、靠多角色讨论碰撞灵感，而大模型按 token 计费时上下文又最先失控。InkForge 把这些合到一个**本地工作台**：

- **心流优先**：编辑器是舞台中央，所有 AI 输出落到右侧时间线，**绝不弹窗**打断打字
- **静默陪写**：每 200 字后台分析；想看就点开，不想看就当它不存在
- **可追溯**：每条 AI 发声都标注 Provider / Model / Skill，能复现能回滚
- **多模型并用**：Claude · OpenAI · Gemini · 任意 OpenAI 兼容端点；每个 Skill / 角色 / 场景可独立绑定
- **可编程的 Skill**：自研宏模板（`{{chapter.title}}` / `{{random:a|b|c}}` / `{{roll:2d6}}` / `{{time}}`），导入导出都是 JSON
- **多角色同台**：酒馆舞台支持多 AI 角色按议题讨论，自带 token 预算、滑窗 + 摘要压缩
- **多书并存**：书房（Bookshelf）模块支持同时打开多本书，每本独立封面、章节按来源（手写 / AI 陪写 / AI 全自动）分类
- **AI 全自动写小说**：AutoWriter 4-Agent 流水线（**Planner → Writer → Critic → Reflector**），共享人物/世界观上下文，OOC 守门员把关；用户只需「给思路 + 纠错」
- **可撤的 AI 修改**：每段 AI 写作前后自动打快照，回滚自身也再打一次，永远能反悔
- **卡牌化世界观**：World Pack 把世界设定打包成可复用、可融合的卡牌；World Info Activator 按关键词自动注入 prompt，注入轨迹全部可追溯
- **角色卡 CCv3 兼容**：可直接导入业界通用的 Character Card v3 PNG（含元数据），与书中人物双向同步
- **作者笔记 / 声音档案**：把作者风格指引、叙述声音作为一类一等公民的上下文，按场景注入
- **场景路由**：14 个场景（chat / analyze / outline-gen / auto-writer / review / letter ...）各自绑定模型，让强模型只用在刀刃上
- **桌宠 + 成就 + 角色来信**：陪伴系桌宠（番茄钟 / 节日装饰 / Konami 彩蛋）+ 29 项写作成就 + AI 让书中人物给作者写信
- **数据自治**：SQLite + Markdown 落本地工作目录，可 Git 可 Obsidian；**应用不调任何上报端点**

> 💡 InkForge 不是在线服务，没有账号系统，没有云同步，也没有遥测。它是一个把 LLM 当成"协作者"而非"对话框"的本地 IDE。

---

## ✨ 核心能力

<table>
<tr><th>模块</th><th>能力</th></tr>
<tr>
  <td><b>编辑器</b></td>
  <td>TipTap 富文本 · 字数 / 字符 / token 实时统计 · Markdown 导入导出 · DB 1.2s + 磁盘 5s 双层 autosave · 崩溃恢复横幅 · 选段工具条（润色 / 审查 / 续写 / 代入）</td>
</tr>
<tr>
  <td><b>Provider</b></td>
  <td>Anthropic · OpenAI · Gemini · 任意 OpenAI 兼容；多 Key 轮询策略：single / round-robin / weighted / sticky + cooldown 自动隔离 rate-limit key</td>
</tr>
<tr>
  <td><b>场景绑定</b></td>
  <td>14 个高级场景（chat / analyze / quick / skill / tavern / auto-writer / review / outline-gen / extract / summarize / inline / daily-summary / letter / research）→ 5 个基础场景 · 每个场景可独立绑 provider + model</td>
</tr>
<tr>
  <td><b>Skill 引擎</b></td>
  <td>5 触发：selection / every-n-chars / on-save / on-chapter-end / manual<br/>自研宏模板：<code>{{selection}}</code>、<code>{{chapter.*}}</code>、<code>{{character.*}}</code>、<code>{{vars.*}}</code>、<code>{{random:a|b|c}}</code>、<code>{{roll:NdM}}</code>、<code>{{time}}</code>、<code>{{//comment}}</code><br/>预设开箱即用 · 灵感来自 SillyTavern macros，完全独立实现</td>
</tr>
<tr>
  <td><b>酒馆 (Tavern)</b></td>
  <td>多 AI 角色按议题讨论 · 导演 / 自动两种模式 · <code>lastK</code> 窗口 + 摘要压缩 · token 预算条 + 警戒提示 · character_sync_log 跨场景同步</td>
</tr>
<tr>
  <td><b>人物 / 世界观</b></td>
  <td>书中人物档案 ↔ 酒馆角色卡双向同步（two-way / snapshot / detached）+ 冲突 diff · 世界条目库（地点 / 门派 / 物件 / 事件 / 概念 + 自定义）支持别名 · 关系图（@xyflow/react）</td>
</tr>
<tr>
  <td><b>🃏 World Pack (世界包)</b></td>
  <td>把世界设定打包成可复用、可融合的卡牌 · 封面图 / 命令面板（cmdk）/ 融合对话框 · 多包套娃挂载（project_world_pack_slots）· 与项目设定融合（build-fusion-prompt + parse-fusion-output）</td>
</tr>
<tr>
  <td><b>🎴 Character Card CCv3</b></td>
  <td>CCv3 编解码 + PNG 元数据读取（png-text）· 直接导入业界通用 Character Card 文件 · 导入指纹去重 · 与书中人物双向同步</td>
</tr>
<tr>
  <td><b>📝 作者笔记 / 声音档案</b></td>
  <td>Author Note 独立面板 + 上下文注入通道 · Voice Profile 管理叙述声音 / 风格档案 · 通过 prompt-context 模块挂载到任意 Skill</td>
</tr>
<tr>
  <td><b>🎯 World Info Activator</b></td>
  <td>SillyTavern Lorebook 风格：关键词触发 + selectiveLogic（and_any / not_all / not_any / and_all）+ 命中概率 + position（before / after / at_depth）· 激活轨迹写入 world_info_trace · 配套 WorldInfoDiagnosticPanel 复盘</td>
</tr>
<tr>
  <td><b>资料检索</b></td>
  <td>Tavily · Bing · SerpAPI · LLM 综述 四 provider 可插拔；凭证 keystore 加密</td>
</tr>
<tr>
  <td><b>RAG 智能路由</b></td>
  <td>对 world_entries / characters / research_notes / sample_chunks 的关键词召回 · 2-char 中文滑窗 tokenization · 按场景路由数据源（rag-smart-router）<br/>当前实现是 SQL LIKE + 智能路由，**非向量嵌入**；hook 留给未来切 vector DB</td>
</tr>
<tr>
  <td><b>全文审查 (Review)</b></td>
  <td>5 builtin 维度：人物一致 / 时间线 / 伏笔 / 世界观 / 语言风格<br/>+ Skill 维度可挂载 · 3 级严重度（info / warn / error）· excerpt 高亮定位 · Markdown 导出</td>
</tr>
<tr>
  <td><b>每日总结</b></td>
  <td>当天字数 + 最近章节 → 4 段 Markdown 日报</td>
</tr>
<tr>
  <td><b>CLI 终端</b></td>
  <td>内嵌 xterm.js + node-pty，可停靠（继承用户权限）· 用于 Skill 调试 / 脚本运行</td>
</tr>
<tr>
  <td><b>Skill 市场</b></td>
  <td>拉取 registry · 一键安装 · 发布向导（skill.json + PR 说明）</td>
</tr>
<tr>
  <td><b>📖 书房 (Bookshelf)</b></td>
  <td>多本书并存（zustand persist）· 标签页切换 · 书架网格 · 每本独立封面（PNG/JPG/WEBP/GIF ≤2 MB）· 章节按来源 4 Tab 过滤（全部 / AI 全自动 / AI 陪写 / 我手写）</td>
</tr>
<tr>
  <td><b>🤖 AutoWriter</b></td>
  <td>4-Agent 流水线：<b>Planner</b>（拆 beats）→ <b>Writer</b>（写段落）→ <b>Critic</b>（OOC / 一致性 / 风格 findings，0-10 分阈值重写）→ <b>Reflector</b>（更新长期记忆，写入 chapter_summaries）<br/>共享上下文：人物档案 + 世界观 + 已写正文 + 用户介入；段落级 OOC 守门员 + 单段重写上限<br/>可暂停 / 恢复 / 停止 / 注入新思路 / 实时纠错；默认统一模型，高级可为每个角色单独绑 provider + model + temperature</td>
</tr>
<tr>
  <td><b>📓 章节日志</b></td>
  <td>每章一份独立日志，4 种触发：完成进度自动 / AutoWriter 结束自动 / 手动随时记录 / 每日 12:00 提醒；条目可由用户或 AI 写入</td>
</tr>
<tr>
  <td><b>↶ 章节快照</b></td>
  <td>每段 AI 写完前后自动打快照（pre-ai / post-ai / pre-rewrite）· 用户可手动备份命名 · 还原时再打 <code>pre-restore</code> 快照让还原本身也可撤 · 自动快照保留最近 50 条，手动快照永不清理</td>
</tr>
<tr>
  <td><b>🐾 桌宠 (Companion)</b></td>
  <td>悬浮桌宠（多种宠物 + 自定义命名）· 状态机：idle / typing / sleepy / cheering / petted / dizzy / wishing / midnight<br/>双击启停番茄钟（25/5）· Alt+Click 调出 AI 闲聊 · 长按抚摸 · 心情自然衰减<br/>节日自动佩戴装饰（春节 / 中秋 / 情人节 / 万圣节 / 圣诞 / 新年 / 用户生日）· Konami code 解锁彩虹皮 · 11:11 许愿模式 · 季节粒子</td>
</tr>
<tr>
  <td><b>🏆 成就大厅</b></td>
  <td>29 项内置成就 · 4 稀有度（common / rare / epic / legendary）· 6 类别（milestone / rhythm / character / world / ai / craft）<br/>触发与字数 / 章节数 / 连续日 / AutoWriter 跑次 / 角色信件 / 快照次数 等挂钩 · 解锁即弹 toast</td>
</tr>
<tr>
  <td><b>💌 角色来信</b></td>
  <td>书中人物以第一人称给作者写信 · 5 种语气（感激 / 抱怨 / 好奇 / 鼓励 / 日常）· 收件箱 UI（已读 / 置顶 / 删除）· 严格 JSON 输出 + 人设注入</td>
</tr>
</table>

---

## 📦 下载安装

到 [Releases](https://github.com/tompignofind123-cyber/inkforge/releases) 下载对应平台的安装包：

| 平台 | 文件 | 备注 |
|---|---|---|
| Windows | `InkForge-x.y.z-x64-setup.exe` | NSIS 安装器，未签名时首次运行可能提示 |
| macOS | `InkForge-x.y.z-x64.dmg` / `-arm64.dmg` | 未公证时需在「系统设置 > 隐私与安全性」放行 |
| Linux | `InkForge-x.y.z.AppImage` / `.deb` | AppImage 加可执行权限即可运行 |

> 0.1.x 阶段所有构建均 **未签名**，运行时系统可能弹安全警告——这是正常现象。正式签名留待 0.2 稳定版。

---

## 🚀 从源码运行（开发者）

前置：**Node 20+**, **pnpm 9+**, 系统具备 C++ 工具链（用于 better-sqlite3 / node-pty 原生模块）。

```bash
git clone https://github.com/tompignofind123-cyber/inkforge.git
cd inkforge

pnpm install
pnpm typecheck                               # turbo 全包检查
pnpm icons                                   # 从 SVG 重新生成 .ico / .png 图标
pnpm --filter @inkforge/desktop dev          # 开发模式
pnpm --filter @inkforge/desktop run dist:win # 打包 Windows .exe 到 apps/desktop/release/
```

首次启动：

1. 选工作目录（Markdown + SQLite 会落到这里）
2. 添加 Provider，填 API Key（本地加密保存）
3. 新建项目 → 写 200 字 → 看右侧 Timeline 冒出第一条 AI 分析

详细架构与扩展点：[CLAUDE.md](CLAUDE.md) / [docs/architecture.md](docs/architecture.md)。
写自己的 Skill：[docs/skill-authoring.md](docs/skill-authoring.md)。

---

## 🗂 仓库结构

10 个项目：1 个 Electron 应用 + 9 个 package。

```
inkforge/
├─ apps/desktop/             Electron 壳：主进程 / preload / renderer / e2e
├─ packages/
│  ├─ shared/                IPC 契约（221 个 channel）+ domain types + i18n（zh/en/ja）
│  ├─ storage/               better-sqlite3 + 26 版迁移 + 46 张表 + 37 个 repo + keystore + 文件布局
│  ├─ llm-core/              LLMProvider 抽象 + 4 适配器（anthropic/openai/gemini/openai-compat）
│  ├─ editor/                TipTap 扩展 + 200 字静默分析 hook + word-count
│  ├─ skill-engine/          自研 macro 模板 + world-info-activator + Skill 解析 / 触发 / 市场拉取
│  ├─ tavern-engine/         多角色 ContextBuilder + Budget + Summary + Round
│  ├─ auto-writer-engine/    4-Agent 流水线（planner / writer / critic / reflector）+ OOC 守门员 + 用户介入队列
│  ├─ research-core/         资料检索 provider 抽象 + Tavily/Bing/Serp/LLM 4 adapter
│  └─ review-engine/         5 builtin 维度 + findings 解析 + 导出
├─ assets/                   Logo / Banner / 图标资源
├─ docs/                     架构 / Skill 作者指南 / release notes 模板
├─ examples/sample-novel/    上手示例项目
└─ scripts/                  build-icons.cjs 等工具脚本
```

构建依赖：`shared → storage → 其它 packages → desktop`。**改完 shared / storage 必须 `pnpm build` 再 typecheck desktop**，否则类型错乱。

---

## 🔒 数据去哪了？

本应用**不连接任何错误收集 / 使用统计 / 内容上传端点**。诊断摘要需用户主动复制粘贴，API Key 已脱敏。

| 类别 | 路径 |
|---|---|
| 正文 | `<workspace>/projects/<name>/chapters/*.md`（纯文本，可任意编辑器打开） |
| 元数据 | `<workspace>/inkforge.db`（SQLite v26，可备份、可迁移） |
| 自动备份 | `<project>/.inkforge/autosave/<chapterId>.md`（5s 旁挂；恢复横幅出现时被引用） |
| 章节快照 | `<project>/.history/snapshots/<chapId>/<id>.md`（pre-ai / post-ai / manual / pre-restore 等） |
| 书籍封面 | `<project>/.bookshelf/cover.<ext>`（≤2 MB，PNG/JPG/WEBP/GIF） |
| API Key | 优先 OS Keychain（`keytar`），回退 AES-256-GCM 加密文件 `<workspace>/keystore.*` |
| 日志 | `<userData>/logs/main.log` · `renderer.log`（仅本地） |

---

## 🧪 验收脚本

```bash
pnpm --filter @inkforge/desktop run verify:all
# verify:migrations    迁移幂等性 + 46 张表 + 索引 + v26 版本
# verify:engine        token 估算 + 预算 + 上下文拼接
# verify:review-engine builtin + parse 容错 + summary + excerpt 定位
# verify:provider      多 Key 轮询策略与 cooldown
# verify:i18n          三语翻译 + 占位符一致 + coerceLang
# verify:catalog       provider 目录完整性
# verify:auto-writer   findings parse / 重写阈值 / role resolver / prompt builder

pnpm --filter @inkforge/desktop run bench:storage
# 默认 5×500×5：seed/list/get/update/feedback/vacuum 基线，回归对照用
# 调节：BENCH_PROJECTS / BENCH_CHAPTERS / BENCH_FEEDBACKS
```

参考基线（开发机 win32，2500 chapters / 12.5k feedbacks / 9.4 MiB DB）：

| 操作 | 耗时 |
|---|---|
| seed (transactional) | 241 ms |
| list_chapters × 5 projects | 4.75 ms |
| get_chapter_by_id × 2500 | 35 ms (~14 μs/op) |
| update_chapter × 1000 (tx) | 31 ms |
| VACUUM | 80 ms (9.39 → 9.18 MiB) |

---

## 🤝 贡献

欢迎以下类型的 PR：

- **新 Skill**：在 `inkforge-skills` registry 仓库提交 PR，或在本仓库 `packages/skill-engine/presets/*.json` 加预设
- **Provider 适配器**：`packages/llm-core` 加一个 `LLMProvider` 实现 + `instantiateProvider` switch 分支
- **Review 维度**：扩展 `packages/review-engine/src/index.ts` 的 `BUILTIN_DIMENSION_SPECS`
- **资料检索 Adapter**：`packages/research-core` 加 `<name>-adapter.ts`
- **AutoWriter Agent**：`packages/auto-writer-engine/src/agent-roles.ts` 调整 prompt 模板，或扩展 OOC 启发式（`ooc-gate.ts`）
- **新成就**：在 `packages/shared/src/achievements.ts` 的 `ACHIEVEMENT_CATALOG` 添加条目；条件判定加到 `apps/desktop/src/main/services/achievement-service.ts`
- **桌宠台词 / 节日装饰**：`apps/desktop/src/renderer/src/components/companion/companion-lines.ts` 与 `companion-festivals.ts`
- **World Pack 模板 / 角色卡**：欢迎贡献样本卡牌到 `examples/`
- **Bug 复现**：开 Issue，附「复制诊断摘要」（开发者模式）粘贴的输出

提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全相关请走 [SECURITY.md](SECURITY.md) 而不是公开 Issue。

---

## 📋 路线图

- ✅ M0 Scaffold · M1 能写 · M2 AI 陪写
- ✅ M3 Skill + 酒馆 + 人物双向同步
- ✅ M4 体系化（审查 / 资料 / 世界观 / 每日总结 / 多 Key 轮询）
- ✅ M5 打磨发布（开发者模式 / 欢迎向导 / 自动更新 / 打包矩阵 / Skill 市场 / 文档 / E2E）
- ✅ M6 持久化加固（双层 autosave + 崩溃标记 + 每周 VACUUM + 性能基线）
- ✅ M7 书房（多书并存 + 书籍封面 + 章节来源分类 + AutoWriter 多 Agent + 章节日志 + 章节快照）
- ✅ M8 陪伴系（桌宠状态机 + 节日装饰 + 番茄钟 + 29 项成就 + 角色来信）
- ✅ **M9 卡牌化（World Pack + Character Card CCv3 + Author Note + Voice Profile + World Info Activator + RAG Smart Router）—— 当前版本 beta.12**
- 🚧 M10 体验打磨与社区生态

---

## 📄 协议

[MIT License](LICENSE) © 2026 InkForge contributors

Skill 模板 / 角色卡 / 示例小说遵循各自原作者协议；冲突时以仓库 `LICENSE` 为准。

---

<div id="-why-inkforge"></div>

## 🌍 Why InkForge (English)

Most writing toolchains keep "plain-text editor" and "AI chat" in separate worlds. Long-form authors need to track timelines across chapters, keep character voices consistent, brainstorm via multi-agent discussion — and LLM context windows quietly collapse first when billed by the token.

**InkForge** unifies these into a single **local-first** workstation:

- **Flow first** — the editor is center stage; every AI output lands in a right-side Timeline. No popups, ever.
- **Silent companion** — analysis fires every 200 characters in the background. Open it when you want, ignore it when you don't.
- **Auditable** — every AI emission is tagged with Provider / Model / Skill. Reproducible, reversible.
- **Multi-model native** — Claude · OpenAI · Gemini · any OpenAI-compatible endpoint. Each Skill, character or scene can bind its own.
- **Scene routing** — 14 advanced scenes (chat / analyze / quick / skill / tavern / auto-writer / review / outline-gen / extract / summarize / inline / daily-summary / letter / research) each bind to a different provider+model, so the strong model only runs where it matters.
- **Programmable Skills** — a Skill is a JSON bundle of `prompt + triggers + model binding + macros`. The macro language is custom (SillyTavern-inspired) — `{{chapter.title}}`, `{{random:a|b|c}}`, `{{roll:2d6}}`, `{{time}}`.
- **Multi-agent stage** — the *Tavern* lets multiple AI personas debate a topic, with token budgets and rolling summarization built-in.
- **Many books, one shelf** — the *Bookshelf* module keeps multiple novels open in tabs; each has its own cover and chapters tagged by origin (manual / AI-assisted / AI-auto).
- **AutoWriter** — a 4-agent pipeline (**Planner → Writer → Critic → Reflector**) writes chapters end-to-end with shared character & worldbuilding context, paragraph-level OOC gating, and live user steering ("inject idea" / "correct"). The Reflector writes a chapter summary into `chapter_summaries` so the next chapter inherits memory.
- **World Pack & Character Card v3** — package worldbuilding as reusable, fusible cards; import industry-standard CCv3 character card PNGs (with metadata) directly.
- **World Info Activator** — SillyTavern-style auto-injection: keyword triggers + `selectiveLogic` + probability + position. Every injection is traced into `world_info_trace` for replay.
- **Author Note · Voice Profile** — first-class context channels for author style guidance and narrative voice, mountable on any Skill.
- **Reversible AI edits** — every AI write snapshots before & after; even a restore takes its own snapshot, so nothing is ever truly lost.
- **Desk pet · Achievements · In-character letters** — a hovering companion (Pomodoro / festival decorations / Konami easter egg), 29 writing achievements, and an inbox where your characters write *to you* in their own voice.
- **Data sovereignty** — SQLite + Markdown in your chosen workspace. Git-friendly, Obsidian-friendly. **No telemetry endpoints, anywhere.**

> InkForge is not a hosted service. No accounts, no cloud sync, no analytics. It treats the LLM as a *collaborator*, not a chatbox.

See [CLAUDE.md](CLAUDE.md) / [docs/architecture.md](docs/architecture.md) for the design, and [docs/skill-authoring.md](docs/skill-authoring.md) to write your own Skills.

---

<div align="center">
  <sub>Built with TipTap · Electron · better-sqlite3 · React · TypeScript · ❤️ for novelists.</sub>
</div>
