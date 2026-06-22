# AI 写作代码复用候选清单

更新时间：2026-06-21

本文只列许可证允许进入代码复用评估的候选。GPL、无许可证、NOASSERTION 项目不进入本清单。

## 复用等级

- A：适合直接按 InkForge 风格重写，短期可落地。
- B：适合提炼设计后局部实现，需要适配现有架构。
- C：暂只保留观察，依赖较重或与宿主强绑定。

## 候选 1：章节事实核查与失败重试

来源：

- 仓库：[Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story)
- 许可证：MIT
- 相关文件：`writing.go`、`prompts.go`、`writing_conflict.go`

复用等级：A

源项目模式：

- 章节生成后调用 `FactCheck` prompt。
- 返回 JSON：`{"result": "PASS", "issues": []}` 或 `{"result": "FAIL", "issues": [...]}`。
- 失败时重复生成，累计失败项。
- 多次失败后进入冲突分析，判断是否能通过“额外写作约束”调和。

InkForge 目标设计：

- 新增 `ChapterFactCheck`，复用现有 `OocFinding` 或新增章节级 finding 类型。
- 在 AutoWriter 质量模式中，整章完成后执行一次章节事实核查。
- 第一版只报告，不自动改正文；第二版再考虑自动补充约束重写。

目标文件：

- `packages/auto-writer-engine/src/chapter-quality.ts`
- `packages/auto-writer-engine/src/pipeline-orchestrator.ts`
- `packages/auto-writer-engine/src/__tests__/chapter-quality.test.ts`

测试要点：

- 能解析 `PASS/FAIL` JSON。
- JSON 解析失败时不让整章崩溃，降级为 warning。
- 事实核查 failure 能形成章节级 finding。
- 快速模式不触发章节级检查。

注意：

- 不建议复制 Go 实现；直接按 TypeScript 重写。
- prompt 可以借鉴结构，但要改成 InkForge 的术语和现有角色/世界观上下文。

## 候选 2：章节摘要作为滚动记忆

来源：

- 仓库：[Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story)
- 许可证：MIT
- 相关文件：`writing.go`、`prompts.go`

复用等级：B

源项目模式：

- 每章生成后立即生成结构化摘要。
- 摘要保留核心事件、人物动态、心理轨迹、状态变化、关键细节、情绪色调。
- 后续章节用摘要作为 HistorySummary。

InkForge 当前状态：

- InkForge 已有章节摘要服务和 `previousChaptersText`。
- 可借鉴的是摘要结构和“状态变化/一次性事件”字段，而不是新增一套摘要系统。

目标设计：

- 优化 AutoWriter 输入中的前情摘要格式。
- 在章节摘要 prompt 中增强：
  - 一次性事件
  - 人物关系变化
  - 持有物/地点/身份状态
  - 后续必须保持的事实

目标文件：

- `apps/desktop/src/main/services/chapter-summary-service.ts`
- `apps/desktop/src/main/services/auto-writer-service.ts`
- 可能涉及 `packages/auto-writer-engine/src/context-merger.ts`

测试要点：

- 摘要内容能进入 AutoWriter prompt。
- 超长前情仍会 compact。
- 不改变现有存储 schema 时，结构化摘要可先以文本格式写入。

## 候选 3：伏笔路线图

来源：

- 仓库：[Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story)
- 许可证：MIT
- 相关文件：`foreshadow.go`、`foreshadow_consistency.go`、`prompts.go`

复用等级：B

源项目模式：

- 根据完整大纲生成伏笔列表。
- 每条伏笔包含：
  - `name`
  - `description`
  - `plant_chapter`
  - `target_chapter`
  - `status`
  - `events`
  - `resolution`
- 每章完成后根据正文更新伏笔状态。
- 可生成 Markdown 伏笔路线图。

InkForge 目标设计：

- 第一版不新增完整 UI，只做 AutoWriter 报告中的“伏笔候选/伏笔状态”。
- 若用户写作要求中出现“伏笔、埋下、回收、线索”等词，提取成 `plotCommitments`。
- 章节完成后检查这些承诺是否被执行。

目标文件：

- `packages/auto-writer-engine/src/prompt-constraints.ts`
- `packages/auto-writer-engine/src/chapter-quality.ts`
- `packages/auto-writer-engine/src/__tests__/chapter-quality.test.ts`

测试要点：

- 能从用户要求中提取伏笔承诺。
- 能在章节级 Critic prompt 中注入伏笔承诺。
- 不做脆弱字符串硬匹配，除非用户明确列出词条。

## 候选 4：全书诊断与修改工单

来源：

- 仓库：[Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story)
- 许可证：MIT
- 相关文件：`postprocess.go`、`prompts.go`

复用等级：B

源项目模式：

- 全书完成后构造 bundle：
  - 设定
  - 章节摘要索引
  - 全书正文
  - token 预算估算
- 如果全文过长，降级为 summary-only。
- 执行：
  - 全书诊断
  - 全书一致性核查
  - 生成修改工单
  - 按章节分组执行

InkForge 目标设计：

- 先做只读报告，不自动执行修改。
- 生成 `BookReviewReport`：
  - 总评
  - 结构节奏
  - 人设台词
  - 设定逻辑
  - 文风 AI 痕迹
  - P0/P1/P2 修改清单

目标文件：

- 可先放在 `packages/review-engine` 或新增 `packages/auto-writer-engine/src/book-quality.ts`
- 主流程暂不接 UI，先暴露引擎函数和测试。

测试要点：

- 上下文预算超限时降级到摘要索引。
- 工单按章节合并。
- priority 排序稳定。

## 候选 5：本地资料上下文与 Apply View

来源：

- 仓库：[glowingjade/obsidian-smart-composer](https://github.com/glowingjade/obsidian-smart-composer)
- 许可证：MIT
- 相关目录：`src/core/rag`、`src/components/apply-view`、`src/database`

复用等级：B

源项目模式：

- 对本地 vault 做上下文感知。
- AI 输出不是直接覆盖，而是进入 apply view。
- 用户确认后应用修改。

InkForge 目标设计：

- `ReferenceTrace`：
  - 当前 beat
  - 角色卡
  - 世界观
  - 前情摘要
  - 文风样本
  - 用户约束
  - RAG 命中资料
- `ApplyDraftPreview`：
  - 用于未来局部改写
  - 用户确认后替换选区
  - 保留快照

目标文件：

- `apps/desktop/src/main/services/auto-writer-service.ts`
- `apps/desktop/src/renderer/src/components/auto-writer/*`
- `apps/desktop/src/renderer/src/components/editor/*`

测试要点：

- ReferenceTrace 不包含敏感 provider/token/payload 信息。
- 局部改写必须可取消，不直接覆盖正文。
- 应用前创建快照或使用编辑器撤销栈。

## 候选 6：Prompt Preset 管理

来源：

- 仓库：[poloclub/wordflow](https://github.com/poloclub/wordflow)
- 许可证：MIT
- 相关文件：`src/prompts/default-prompts.json`

复用等级：C

源项目模式：

- prompt 以 JSON preset 管理。
- writing assistant 操作可配置。

InkForge 目标设计：

- InkForge 已有 Agent system prompts 和 Skill 预设，不急于迁移。
- 可在后续将 AutoWriter 的 Planner / Writer / Critic / Reflector prompt 做成可版本化 preset。

目标文件：

- `packages/auto-writer-engine/src/agent-roles.ts`
- 未来可能涉及 Skill preset。

测试要点：

- 默认 prompt 稳定。
- 用户 preset 不破坏必需占位符。
- prompt 版本迁移有 fallback。

## 第一轮实施建议

优先做 A 级和低风险 B 级：

1. `ChapterFactCheck`：章节级事实核查，只读报告。
2. `AutoWriterRunReport`：生成结束后汇总约束命中、禁止项、重写原因、上下文来源。
3. `ReferenceTrace`：先在引擎层记录每段使用了哪些上下文，不改 UI。

暂缓：

- 自动执行全书工单。
- 完整伏笔 UI。
- MCP/tool registry。
- Prompt preset 外部化。

对应的 AutoWriter 质量管线设计见 [autowriter-quality-pipeline-design.md](autowriter-quality-pipeline-design.md)。

## Attribution 要求

如果后续确实复制或改写 MIT 项目中的代码片段，需要：

1. 在 InkForge 仓库保留对应 MIT license 文本或在 `NOTICE` / 文档中记录来源。
2. 在被移植文件顶部或相邻文档中说明：
   - 来源仓库
   - 来源文件
   - 原许可证
   - 改写范围
3. 测试覆盖移植逻辑，避免成为不可维护的黑箱。

建议第一轮尽量只“借鉴结构，重新实现”，这样可降低许可和维护风险。
