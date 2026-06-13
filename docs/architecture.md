# InkForge · 架构

> 目标读者：想扩展 InkForge、新增 Provider/Skill/Adapter，或 审阅安全性的开发者
> 版本：对应主计划 v4 + M5 筹备阶段

## 1. 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (React 18 + TypeScript)                           │
│  ├ WorkspacePage (编辑器 / 时间线 / 开发模式终端)          │
│  ├ SkillPage / CharacterPage / TavernPage                  │
│  ├ WorldPage / ResearchPage / ReviewPage                   │
│  └ StatusBar (日进度 + 📝 今日总结)                        │
└───────────────▲──────────────────▲──────────────────────────┘
                │ window.inkforge  │ onChunk / onDone events
                │ (contextBridge)  │
┌───────────────┴──────────────────┴──────────────────────────┐
│  Main Process (Electron + Node)                             │
│  ├ ipc/*.ts     (17 handler files)                         │
│  ├ services/*   (LLM + DB + 订阅式事件广播)               │
│  └ preload/     (InkforgeApi 类型化 IPC 封装)              │
└─────────────────────────────────────────────────────────────┘
         │ better-sqlite3 / fs / keytar / node-pty(开发模式)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Workspace (用户自选目录)                                   │
│  ├ inkforge.db  (SQLite, 12 migrations, 20 tables)         │
│  ├ keystore.*   (AES-GCM 加密的 API Key 回退)              │
│  └ projects/<name>/chapters/*.md                            │
└─────────────────────────────────────────────────────────────┘
```

**关键决策**：

- **Renderer 零直接 FS/DB**：通过 `preload` 暴露的类型化 API（`InkforgeApi`）调 IPC；`contextIsolation` 打开
- **主进程是唯一的 API Key 持有者**：读 keystore → 打到 Provider SDK，Renderer 永远只收到脱敏 `ProviderRecord`
- **流式事件**：分析 / Skill / 酒馆 / 审查 / 每日总结都通过 `window.webContents.send(channel, payload)` 向 Renderer 推流

---

## 2. Packages 依赖图

```
apps/desktop
  ├─ @inkforge/shared        (types + ipc contracts + preload API type)
  ├─ @inkforge/storage       (better-sqlite3 + migrations + keystore)
  ├─ @inkforge/llm-core      (LLMProvider 抽象 + AnthropicProvider)
  ├─ @inkforge/editor        (TipTap 扩展 + 200 字分析 hook + word count)
  ├─ @inkforge/skill-engine  (validate + template render + TriggerScheduler + SkillRunner + pack IO)
  ├─ @inkforge/tavern-engine (ContextBuilder + BudgetTracker + SummaryCompactor + RoundOrchestrator)
  ├─ @inkforge/research-core (ResearchProviderAdapter + 4 adapter)
  └─ @inkforge/review-engine (5 builtin prompt + JSON parse + summary + excerpt range)
```

依赖规则：

- 所有 engine 包**不**依赖 Electron / better-sqlite3；只消费 `@inkforge/shared` 类型，通过 DI 接受 LLM stream 回调
- `@inkforge/storage` 只做 SQLite / keystore，无业务知识
- `apps/desktop/main/services/*` 是组装层：engine + storage + keystore + electron 事件

---

## 3. 数据模型

12 个 migration（见 `packages/storage/src/migrations.ts`），产生 20 张表 + 21 个索引：

| 迁移 | 主要表 | 来源 |
|------|--------|------|
| v1 | `projects` `chapters` `providers` `ai_feedbacks` | M0 |
| v2 | `outline_cards` `daily_logs` `app_settings` | M1 |
| v3 | `skills` | M3-A |
| v4 | `tavern_cards` `characters` | M3-A |
| v5 | `character_sync_log` | M3-A |
| v6 | `tavern_sessions` `tavern_messages` | M3-A |
| v7 | 补索引 + unique partial | M3-A |
| v8 | `world_entries` | M4-A |
| v9 | `research_notes` | M4-A |
| v10 | `review_dimensions` `review_reports` `review_findings` | M4-A |
| v11 | `daily_logs` 加 summary/provider_id/model/generated_at | M4-A |
| v12 | `provider_keys` + `providers.key_strategy/cooldown_ms` + 老 key 搬家 | M4-A |

运行 `pnpm --filter @inkforge/desktop run verify:migrations` 会在临时目录创建空库 → 跑完 12 个迁移 → 断言表/索引齐全（5 项绿）。

---

## 4. 核心数据流

### 4.1 200 字分析（M2）

```
EditorPane keystroke
  └→ useAnalysisTrigger (debounce 10s + 阈值按语言 grapheme 计)
      └→ ipc llm:analyze  (main)
          └→ analysis-service.startAnalysis
              ├─ rate-limit 每 chapter 每分钟 2 次
              ├─ llm-runtime.resolveApiKey (经 ProviderKeyRouter 路由)
              └─ llm-runtime.streamText → 流出 chunk
                  ├─ emit llm:chunk  → AITimeline 追加徽章
                  └─ emit llm:done   → 落表 ai_feedbacks
```

### 4.2 Skill 执行（M3-B）

```
EditorPane "跑 Skill ▾" / SelectionToolbar
  └→ ipc skill:run
      └→ skill-service.runSkill
          ├─ renderSkillTemplate({{...}})
          ├─ streamText (按 Skill.binding.provider/model)
          └─ emit skill:chunk / skill:done → 写 ai_feedbacks

chapter:update IPC
  └→ skill-trigger-service.flushOnSave
      └→ TriggerScheduler.ingest({type:"save"})
          └→ 调度所有 on-save 维度 Skill
```

### 4.3 酒馆回合（M3-D）

```
ipc tavern-round:run
  └→ tavern-round-service.startTavernRound
      └→ RoundOrchestrator.run
          for each round 0..autoRounds:
            for each participant card:
              ├─ ContextBuilder.build (speaker persona + 摘要 + lastK + director)
              ├─ BudgetTracker.estimateTokens
              ├─ streamText → emit tavern:chunk
              └─ recordUsage
          shouldCompactBeforeNextRound? → emit tavern:budget-warning

ipc tavern-summary:compact
  └→ tavern-summary-service.compactTavernHistory
      └→ SummaryCompactor.compact (事务内删旧 + 插 summary message)
```

### 4.4 全文审查（M4-B）

```
ipc review:run
  └→ review-service.startReview
      ├─ insert review_reports (status=running)
      ├─ for each chapter × enabled dimension:
      │    ├─ getBuiltinPromptSpec(dim.builtinId)
      │    ├─ streamText → accumulate → parseFindingsFromLlm
      │    └─ insert review_findings (带 excerpt_start/end)
      ├─ throttled emit review:progress (500ms)
      └─ computeReportSummary → update review_reports (completed)
          └─ emit review:done

前端 findings → onJumpChapter(id) → setChapter + setMainView('writing')
```

### 4.5 资料检索（M4-D）

```
ipc research:search
  └→ research-service.searchResearch
      ├─ adapter = tavily / bing / serpapi / llm-fallback
      ├─ apiKey ← keystore "research:${provider}"
      ├─ adapter.search → hits
      └─ 失败 → 回退 llm-fallback (调当前 LLM 走 JSON 综述)
```

---

## 5. 遥测与安全

- **§13 零上报**：整个代码库搜不到 Sentry / analytics SDK。日志只写本地 `<userData>/logs/*.log`
- **§11.3 Key 保护**：
  - 优先 OS Keychain（`keytar` 动态 require，不可用时悄悄降级）
  - 回退：AES-256-GCM + 32B 主密钥（`<workspace>/keystore.master`，权限 0o600）
  - Renderer 永远拿不到明文 Key：`provider:save` 只接收，不返回；诊断摘要也不含
- **§R6 CLI 安全**：内嵌终端是开发/排查模式入口。生产包默认不携带 `node-pty`，普通用户界面不显示终端；开发构建中 xterm + node-pty 继承用户权限，并在危险命令前做二次确认。
- **崩溃行为**：Renderer 崩溃显示本地错误页；Main 崩溃下次启动给「查看日志」选项，**不发送任何数据**
- **§5.4 持久化加固（M6-D）**：
  - 编辑器双层落盘：DB 1.2s 防抖写 + `<project>/.inkforge/autosave/<chapterId>.md` 5s 旁挂；切换章节时 `chapter:autosave-peek` 比对，若旁挂副本与 DB 不一致则提示恢复
  - 崩溃标记 `<userData>/session.lock`：启动写入、`before-quit` 清除；`uncaughtException` / `unhandledRejection` 写回 reason
  - 每周 VACUUM：`<workspaceDir>/maintenance.json` 持久化 `lastVacuumAt`，启动 30s 后判定 + 每 24h 重检

---

## 6. 扩展点

### 6.1 新增 LLM Provider

1. 在 `packages/llm-core/src/` 新建 `xxx-provider.ts` 实现 `LLMProvider`
2. 在 `apps/desktop/src/main/services/llm-runtime.ts` 的 `instantiateProvider` switch 里加分支
3. shared 类型 `ProviderVendor` 增加枚举

### 6.2 新增 Research Adapter

在 `packages/research-core/src/` 加 `<name>-adapter.ts`，实现 `ResearchProviderAdapter`；在 `research-service.adapterFor` 加 case。

### 6.3 新增 Review 维度

- **builtin**：扩展 `packages/review-engine/src/index.ts` 的 `BUILTIN_DIMENSION_SPECS`；`ReviewBuiltinId` 加枚举值
- **skill**：任何 Skill 都可作为维度挂载：`review-dim:upsert { kind: "skill", skillId }`（M4-B 当前版先记录不执行，执行计划在 M5+）

### 6.4 新增 IPC Channel

1. `@inkforge/shared/src/ipc.ts`：加 channel + input/output type + 扩展 `IpcRequestMap/EventMap`
2. `@inkforge/shared/src/preload.ts`：加 namespace 方法
3. `apps/desktop/src/preload/index.ts`：加 runtime `ipcRenderer.invoke`
4. `apps/desktop/src/main/ipc/<name>.ts`：写 handler
5. `apps/desktop/src/main/ipc/register.ts`：挂上

---

## 7. 开发流程

```bash
pnpm install
pnpm typecheck                 # turbo 全包检查（17/17）
pnpm --filter @inkforge/desktop dev
```

修改 shared types 时会触发下游所有包 typecheck；turbo 缓存受益明显。

跑验收脚本：

```bash
pnpm --filter @inkforge/desktop run verify:all
# verify:migrations  (5 项：20 表 + 21 索引 + schema_migrations 12 版本 + 幂等)
# verify:engine      (15 项：token 估算 + 预算 + 上下文拼接)
# verify:review-engine (40 项：builtin + parse 容错 + summary + excerpt 定位)
```

跑性能基准（§5.4）：

```bash
pnpm --filter @inkforge/desktop run bench:storage
# 默认规模 5 projects × 500 chapters × 5 feedbacks
# 调节：BENCH_PROJECTS / BENCH_CHAPTERS / BENCH_FEEDBACKS
# 输出 list / get / update / vacuum 各项耗时与 DB 体积，回归对照用
```

参考基线（默认规模，2500 chapters / 12.5k feedbacks / 9.4 MiB DB，开发机 win32）：

| 操作 | 耗时 |
| --- | --- |
| seed (transactional) | 241 ms |
| list_chapters × 5 projects | 4.75 ms |
| get_chapter_by_id × 2500 | 35 ms (~14 μs/op) |
| update_chapter × 1000 (tx) | 31 ms |
| count_feedbacks × 200 | 0.89 ms |
| VACUUM | 80 ms (9.39 → 9.18 MiB) |

---

## 8. 参考

- 主计划：[novel-writing-app.md](../C:/Users/123/.claude/plan/novel-writing-app.md)（存于 Claude 用户目录）
- M3 细案：[novel-writing-app-m3.md](../C:/Users/123/.claude/plan/novel-writing-app-m3.md)
- M4 细案：[novel-writing-app-m4.md](../C:/Users/123/.claude/plan/novel-writing-app-m4.md)
- M5 细案：[novel-writing-app-m5.md](../C:/Users/123/.claude/plan/novel-writing-app-m5.md)
- M7 细案：[shiny-booping-honey.md](../C:/Users/123/.claude/plans/shiny-booping-honey.md)（书房 + AutoWriter + 快照 + 章节日志）

---

## 9. M7 · Bookshelf 模块（书房 / AutoWriter / 章节日志 / 快照）

> **零侵入扩展**。所有现有功能、表、IPC channel、UI 完全保留——下面所有内容都是新增。

### 9.1 模块全景

```
ActivityBar
  └─ 📖 书房 (mainView='bookshelf')
       └─ /bookshelf 路由 → BookshelfPage
            ├─ BookTabsBar           多本书并存（zustand persist localStorage）
            ├─ BookHeader            封面 + 统计 + 三类来源计数
            ├─ ChapterOriginTabs     [全部 / AI 全自动 / AI 陪写 / 我手写]
            └─ ChapterListItem
                 ├─ 来源切换         origin_tag 即时写入
                 ├─ 🤖 AI 写         → AutoWriterPanel
                 ├─ 📓 日志          → ChapterLogDrawer
                 └─ ↶ 快照           → SnapshotMenu
```

ReminderToast 在 App.tsx 顶层挂载——监听 `chapter-log:daily-reminder` 事件，每日 12:00 提醒写日志。

### 9.2 数据层（迁移 v14，6 张新表）

| 表 | 用途 | 关键约束 |
| --- | --- | --- |
| `book_covers` | 每本书一个封面，文件落 `<project>/.bookshelf/cover.<ext>` | UNIQUE(project_id) |
| `chapter_origin_tags` | 章节来源逻辑标签（`ai-auto` / `ai-assisted` / `manual`） | PRIMARY KEY(chapter_id)；旧章节默认按 `manual` 渲染 |
| `chapter_logs` + `chapter_log_entries` | 每章独立日志（`progress` / `ai-run` / `manual` / `daily-reminder` × `user` / `ai`） | UNIQUE(chapter_id) on chapter_logs |
| `chapter_snapshots` | 细粒度快照，文件落 `<project>/.history/snapshots/<chapId>/<id>.md` | kind ∈ manual / pre-ai / post-ai / pre-rewrite / pre-restore / auto-periodic |
| `auto_writer_runs` | AutoWriter 一次运行的元数据 + 用户介入累积 | 同章节同时只允许一个 'running'/'paused' run |

迁移幂等：所有 DDL 用 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`。

### 9.3 多 Agent 协作引擎：`@inkforge/auto-writer-engine`

纯逻辑包（无 Electron / 无 IPC / 无 DB），通过 DI 接入主进程：

```
PipelineDeps
  ├─ invokeAgent(role, system, user, onDelta) → {text, tokensIn, tokensOut}
  ├─ createSnapshot(kind, segmentIndex, chapterText)
  ├─ applyChapterContent(chapterText)        ← 章节文件 + DB 行覆盖
  ├─ runOocGate(...)                          ← 段落级人物 / 世界观启发式校验
  ├─ drainInterrupts() → AutoWriterCorrectionEntry[]
  ├─ emitPhase / isCancelled / isPaused
```

主循环（每个 beat）：

```
pre-ai snapshot
  → Writer 写本段
  → applyChapterContent (实时落地)
  → post-ai snapshot
  → Critic 审稿 + runOocGate
     ↓ 阈值判定
     ├─ shouldRewriteFromFindings && rewriteCount < max
     │     → pre-rewrite snapshot → 回滚到 pre-ai → 回 Writer
     └─ pass / 重写次数耗尽
           → Reflector 写改进备忘 → 进入下一 beat
```

**共享上下文**：`userIdeas + chapterSoFar + characters + worldEntries + lastCriticFindings + reflectorMemo + drainedInterrupts`。
**Critic 阈值**：1 条 `error` 或 ≥2 条 `warn` 触发回炉；重写上限默认 3 次。
**模型绑定**：默认统一一个 Writer binding（其他 3 角色复用），高级用户可分别绑定。

### 9.4 IPC channel 列表（新增 24 个 request + 5 个 event）

| 分组 | request | event |
| --- | --- | --- |
| Bookshelf | `bookshelf:list-books`, `book-cover:upload/get/delete` | — |
| Origin Tag | `origin-tag:set/get/list-by-origin` | — |
| Chapter Log | `chapter-log:list/append-manual/append-ai/delete` | `chapter-log:daily-reminder` |
| AutoWriter | `auto-writer:start/stop/pause/resume/get-run/list-runs/inject-idea/correct` | `auto-writer:chunk/phase/done/snapshot` |
| Snapshot | `snapshot:create/list/get/restore/delete` | — |

所有契约在 `packages/shared/src/ipc.ts` 用 interface declaration merging 扩展 `IpcRequestMap` / `IpcEventMap`，不修改既有键顺序。

### 9.5 文件系统约定

```
<project>/
├─ chapters/                  ← 现有，不动
├─ characters/                ← 现有，不动
├─ world/                     ← 现有，不动
├─ .history/                  ← 现有，autosave 已用
│   ├─ .autosave-<chapId>.md  ← 现有 5s 旁挂
│   └─ snapshots/             ← 🆕 M7
│       └─ <chapId>/
│           └─ <snapId>.md    ← 单条快照内容
└─ .bookshelf/                ← 🆕 M7
    └─ cover.<png|jpg|webp>
```

### 9.6 验收

```bash
pnpm --filter @inkforge/desktop run verify:auto-writer
# 41 项断言：findings parse 容错（8）+ 重写阈值（6）+ 计数（3）
#         + markdown 渲染（5）+ role resolver（8）+ prompt builder（11）

pnpm --filter @inkforge/desktop run verify:all
# 全套：26 表 + 30 索引 + 14 迁移版本 + 7 个 verify suite
```

### 9.7 风险与权衡

| 风险 | 缓解 |
| --- | --- |
| 细粒度快照磁盘膨胀 | `pruneOldAutoSnapshots(keepN=50)`；手动 + pre-restore 永不清理 |
| AutoWriter 与 5s autosave 冲突 | 物理隔离（`.bookshelf/` vs `.history/.autosave-*.md`）；AutoWriter 走 `chapter:update` 主路径 |
| Critic 假阳性死循环 | 单段 ≤3 次重写，超出抛 finding 让用户裁决 |
| 多 Tab 内存占用 | Bookshelf store 上限 5 本 Tab；超出自动淘汰最旧 |
| 老用户不需要新功能 | ActivityBar 默认显示但单独可隐藏；不进入 `/bookshelf` 路由代码完全不触达 |
| 旧章节没 origin tag | 视图层 fallback 显示为 `manual`；origin-tag 表的 listByOrigin 在 origin='manual' 时默认包含未打标章节 |
