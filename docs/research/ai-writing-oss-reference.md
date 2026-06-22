# AI 写作开源项目参考矩阵

更新时间：2026-06-21

本文记录 InkForge / AutoWriter 可参考的 AI 写作开源项目。结论以“许可证是否允许代码复用”为第一优先级；GPL、无许可证或许可证不明确项目只作为产品与架构参考，不复制代码。

## 复用原则

- MIT / Apache-2.0 / BSD 项目：可以在保留版权声明、许可证文本和必要来源说明的前提下复制、改写、移植代码。
- GPL / AGPL 项目：只学习产品、架构和交互，不复制代码到 InkForge。
- 无许可证 / NOASSERTION / Other：只阅读公开设计和行为，不复制代码。
- 即使许可证允许，也优先“迁移思路并重写为 InkForge 风格”；只有当模块边界清晰、依赖少、测试可覆盖时，才考虑代码级移植。

## 仓库矩阵

| 仓库 | Stars | 技术栈 | 许可证 | 代码复用级别 | InkForge 相关性 | 主要可借鉴点 |
| --- | ---: | --- | --- | --- | --- | --- |
| [Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story) | 188 | Go + Svelte | MIT | 可复制/改写 | 极高 | 章节生成流水线、事实核查、伏笔系统、全书诊断、工单式后处理 |
| [FlickeringLamp/ai-novelist](https://github.com/FlickeringLamp/ai-novelist) | 202 | TypeScript + Python backend | MIT | 可复制/改写 | 高 | function calling、RAG、MCP、skills、人机协同写作 |
| [glowingjade/obsidian-smart-composer](https://github.com/glowingjade/obsidian-smart-composer) | 2295 | TypeScript / Obsidian plugin | MIT | 可复制/改写 | 高 | 本地资料库上下文、语义检索、一键编辑、局部应用视图 |
| [poloclub/wordflow](https://github.com/poloclub/wordflow) | 269 | TypeScript + Vite | MIT | 可复制/改写 | 中 | prompt 模板、多模型适配、可定制写作助手 |
| [heider-x/vela](https://github.com/heider-x/vela) | 420 | Electron + React + TypeScript | GPL-3.0 | 只参考，不复制 | 高 | 小说写作 IDE、本地优先、BYOK、RAG、Electron 产品结构 |
| [ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant) | 1710 | TypeScript | NOASSERTION | 只参考，不复制 | 极高 | 长篇小说端到端生产、Agent 分工、世界观、RAG、写法引擎 |

## 重点发现

### Nigh/show-me-the-story

这是目前最值得优先深挖的 MIT 项目。它的目录结构直接暴露了长篇写作链路：

- `outline.go`：大纲生成与后续章节大纲。
- `writing.go`：章节写作主流程。
- `foreshadow.go` / `foreshadow_consistency.go`：伏笔规划、状态追踪、一致性检查。
- `postprocess.go`：全书诊断、一致性核查、修改工单、批量执行。
- `writing_conflict.go`：事实核查失败后的冲突分析与处理建议。
- `prompts.go` / `prompts_en.go`：中英文 prompt 模板。

关键流程：

1. 写作前检查本章大纲是否与已写剧情冲突。
2. 注入前情摘要、上一章结尾、角色、世界观、伏笔、后续大纲约束。
3. 生成章节正文。
4. 生成章节摘要，作为后续章节记忆。
5. 事实核查章节与前情/大纲是否矛盾。
6. 失败时重试，累计失败项。
7. 多次失败后分析冲突根因，给出额外写作约束或建议用户修改大纲/伏笔。
8. 章节完成后同步伏笔状态。
9. 全书完成后执行诊断、一致性核查、生成修改工单、按章执行后处理。

可直接转化为 InkForge 设计：

- `ChapterCritic`：章节级审稿，而不只是逐段 Critic。
- `FactCheckCritic`：客观事实核查，输出结构化 `PASS/FAIL`。
- `ForeshadowTracker`：伏笔埋设/推进/回收状态。
- `PostProcessRoadmap`：全书诊断后生成按章节分组的修改工单。
- `WritingConflictAnalysis`：当重复重写仍失败时，判断是正文问题还是大纲/伏笔/前情冲突。

### FlickeringLamp/ai-novelist

仓库结构显示其后端拆分为：

- `backend/ai_agent`
- `backend/api`
- `backend/file`
- `backend/git`
- `backend/settings`
- `backend/storage`
- `backend/websocket`
- `backend-skill`

它更像“项目感知 AI 写作助手”，而不是单纯小说生成器。适合研究：

- tools / skills 如何参与写作。
- 人在回路的修改确认流程。
- RAG、MCP、function calling 如何组合。
- WebSocket 状态流如何承载长任务。

InkForge 可吸收方向：

- 将“查角色卡”“查世界观”“检查矛盾”“生成摘要”做成内部 tool，而不是全部塞进 prompt。
- 中长期可扩展为 `AutoWriterToolRegistry`。
- 当前阶段不建议直接引入 MCP 复杂度，先整理工具边界。

### glowingjade/obsidian-smart-composer

仓库结构重点：

- `src/core/llm`
- `src/core/mcp`
- `src/core/rag`
- `src/database`
- `src/components/apply-view`
- `src/components/chat-view`

适合借鉴：

- 本地资料库上下文检索。
- AI 生成结果如何以 apply view 方式让用户确认。
- 编辑器内 one-click edit 的状态流。
- 检索结果与聊天/写作上下文如何绑定。

InkForge 可吸收方向：

- `ReferenceTrace`：记录每段使用了哪些角色卡、世界观、前情、样本、约束、RAG 命中资料。
- 局部改写采用“预览后应用”，避免模型直接覆盖用户正文。
- AutoWriter 报告中显示资料来源，而不是只显示生成结果。

### poloclub/wordflow

仓库结构重点：

- `src/prompts/default-prompts.json`
- `src/llms/gpt.ts`
- `src/llms/gemini.ts`
- `src/llms/web-llm.ts`
- `src/llms/wordflow.ts`

适合借鉴：

- prompt 模板如何配置化。
- 多模型适配的前端抽象。
- 可定制写作助手的任务组织。

InkForge 已有 `llm-runtime` 和 Agent 配置，因此不建议直接搬 provider 层；更适合借鉴 prompt preset / writing action 的组织方式。

### heider-x/vela

许可证为 GPL-3.0。它与 InkForge 技术栈接近，但不能复制代码。

只建议观察：

- Electron 写作 IDE 页面布局。
- 本地优先 + RAG + BYOK 的产品路径。
- 网文作者场景下的资料区、编辑区、AI 区如何组织。

### ExplosiveCoderflome/AI-Novel-Writing-Assistant

许可证不明确。它与 InkForge 领域高度接近，但只能学习设计。

只建议观察：

- Agent 分工。
- 世界观、写法引擎、RAG、整本生产工作流如何组合。
- 从一句灵感到完整小说的产品流程。

## InkForge 第一轮吸收方向

第一轮只从 MIT 项目中吸收可复用设计，优先实现低风险、可测试、少 schema 变更的能力：

1. `AutoWriterRunReport`
   - 汇总本次生成使用了哪些约束、资料和上下文。
   - 汇总必写词命中、禁止词违规、重写原因。
   - 先作为运行结束内存/日志报告，不急于改数据库 schema。

2. `ChapterCritic`
   - 章节完成后执行一次整章审稿。
   - 第一版只输出 findings，不自动改正文。
   - 参考 `show-me-the-story` 的 `FactCheck`、`BookDiagnosis`、`BookConsistencyCheck` 思路。

3. `ReferenceTrace`
   - 每段生成前记录使用的角色卡、世界观、前情、样本、约束。
   - 后续 UI 可展示“本段参考来源”。
   - 参考 `obsidian-smart-composer` 的上下文感知方向。

4. `ForeshadowTracker`
   - 把伏笔变成结构化项：名称、描述、埋设章节、回收章节、状态、事件记录。
   - 先可以作为章节级报告的一部分，不必立刻做完整 UI。

5. `PostProcessRoadmap`
   - 全书完成后生成修改工单。
   - 工单按章节分组，每章合并多个问题。
   - 先做设计，不急于执行自动批量修改。

## 代码复用边界

可考虑复制/改写的来源：

- `Nigh/show-me-the-story`：MIT，可复制/改写小型纯逻辑、prompt 结构、JSON 解析与工作流状态思想。
- `FlickeringLamp/ai-novelist`：MIT，可复制/改写工具/skill/RAG 的结构性代码，但需先确认具体文件依赖。
- `glowingjade/obsidian-smart-composer`：MIT，可复制/改写上下文检索和 apply-view 的小型模式，但 Obsidian API 绑定部分不适合移植。
- `poloclub/wordflow`：MIT，可复制/改写 prompt preset 组织方式和模型抽象思路。

不可复制代码的来源：

- `heider-x/vela`：GPL-3.0。
- `ExplosiveCoderflome/AI-Novel-Writing-Assistant`：许可证不明确。

## 下一步

进入代码候选筛选：

1. 深挖 `show-me-the-story` 的：
   - `writing.go`
   - `foreshadow.go`
   - `postprocess.go`
   - `writing_conflict.go`
   - `prompts.go`
2. 对照 InkForge 当前：
   - `packages/auto-writer-engine/src/pipeline-orchestrator.ts`
   - `packages/auto-writer-engine/src/context-merger.ts`
   - `packages/auto-writer-engine/src/prompt-constraints.ts`
   - `apps/desktop/src/main/services/auto-writer-service.ts`
3. 产出 `COPY_CANDIDATES.md`，只列 MIT 来源下可迁移模块。

阶段 2 对标设计已整理在 [autowriter-quality-pipeline-design.md](autowriter-quality-pipeline-design.md)。
