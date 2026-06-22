# AutoWriter 质量管线对标设计

更新时间：2026-06-21

本设计基于 InkForge 当前 AutoWriter 实现，并对标 MIT 项目 [Nigh/show-me-the-story](https://github.com/Nigh/show-me-the-story) 的长篇小说生成链路。目标是吸收“章节级/全书级质量控制”模式，而不是直接复制 Go 代码。

## 当前实施进度

已完成第一轮引擎层实现：

- 已新增本地 prompt 约束抽取、Planner beat 修补、Writer/Critic/Reflector 约束注入。
- 已在质量模式下把“本段必写词缺失”和“明确禁止词出现”合并进 Critic findings，触发现有重写与 best-of-N 逻辑。
- 已新增 `ChapterFactCheck` 解析/汇总工具，支持结构化 JSON 和异常输出兜底。
- 已新增 `AutoWriterRunReport`，生成结束后在 `stats.report` 中记录必写/禁止词命中、段落重写次数、段落约束、使用资料摘要。
- 已接入章节级只读 fact check：质量模式且启用校阅时，整章完成后复用 Critic 绑定检查客观事实和硬性约束；结果只写入报告，不自动重写整章，不覆盖已写正文。
- 已接入最小写作冲突分析：当章节级检查失败时，复用 Critic 绑定判断根因来自生成执行失败、用户约束冲突、前情/世界观冲突或其他原因；结果只写入 `stats.report.writingConflict`，不生成新正文，不自动改稿。
- 已接入轻量伏笔/剧情承诺追踪：从用户要求、初始补充和运行中修正里抽取伏笔、回收、揭示、避免提前揭示等承诺，注入 Planner / Writer / Critic / Reflector / ChapterFactCheck / WritingConflict prompt，并写入 `stats.report.plotCommitments`。
- 已新增 `AutoWriterRunReport` 的中文 Markdown 渲染工具，方便后续 UI、日志或导出复用；文案使用“要求执行、剧情承诺、章节复核、冲突分析”等用户语言，不暴露 provider/token/payload 等实现词。
- 已新增全书级诊断基础设施：`BookDiagnosisResult` / `BookRevisionTask` 类型、容错 JSON 解析器、全书诊断 prompt builder。当前只作为纯引擎工具导出，不在 AutoWriter run 中自动调用，不生成正文，不写入存储。
- 快速模式仍跳过逐段 Critic/Reflector 和章节级 fact check，只保留 prompt 约束注入与报告汇总。

暂未实现：

- 章节级自动修订。
- 全书级诊断的自动调用、UI 展示与修改工单流转。
- 报告 UI 展示。

## 当前 InkForge AutoWriter 状态

当前核心文件：

- `packages/auto-writer-engine/src/pipeline-orchestrator.ts`
- `packages/auto-writer-engine/src/context-merger.ts`
- `packages/auto-writer-engine/src/prompt-constraints.ts`
- `apps/desktop/src/main/services/auto-writer-service.ts`

当前能力：

- Planner 输出 beats。
- Writer 按 beat 逐段生成。
- Critic 逐段审稿。
- Reflector 生成下一段备忘。
- 质量模式支持单段重写和 best-of-N 采纳。
- 本地约束检查已能把“本段必写词缺失”和“出现禁止词”转成 `error` finding。
- AutoWriter service 已组装章节标题、已写正文、角色、世界观、全局世界观、前情摘要、文风样本、声音档案。
- 章节落盘后会异步触发章节摘要生成。

当前缺口：

- 缺少整章完成后的章节级审稿。
- 缺少客观事实核查专用阶段。
- 缺少“重复失败是正文问题还是大纲/前情/伏笔冲突”的分流。
- 缺少对伏笔/承诺项的结构化追踪。
- 缺少生成结束后的可解释报告。
- 缺少全书级诊断和修改工单。

## show-me-the-story 可迁移模式

`show-me-the-story` 的主流程可以概括为：

1. 写前检查本章大纲与已写剧情是否冲突。
2. 生成章节正文。
3. 生成章节摘要。
4. 执行章节事实核查。
5. 事实核查失败时重试。
6. 多次失败后执行写作冲突分析。
7. 若冲突可调和，生成额外写作约束后再试。
8. 若不可调和，提示用户修改大纲、伏笔或人工保留草稿。
9. 章节完成后更新伏笔状态。
10. 全书完成后执行诊断、一致性核查、生成修改工单。

可迁移到 InkForge 的核心不是代码，而是任务分层：

- 段落级：控制局部执行和语言质量。
- 章节级：控制事实、衔接、用户目标是否整体完成。
- 全书级：控制结构、节奏、人设、伏笔和后处理工单。

## 目标质量管线

建议把 AutoWriter 质量管线分为三层。

### 第一层：段落级

这是当前已有能力，继续保留：

```text
Planner -> Writer(segment) -> LocalConstraintCheck -> Critic(segment) -> Rewrite -> Reflector
```

职责：

- 让每段直接执行当前 beat。
- 确保本段必写词落地。
- 避免明确禁止词。
- 保持人物、世界观、风格、段落排版。
- 通过 Reflector 把上一段问题带到下一段。

不建议在这一层加入太多全局任务，否则会拖慢生成并让单段 prompt 过重。

### 第二层：章节级

新增章节完成后的只读检查：

```text
All segments done -> ChapterFactCheck -> ChapterCritic -> AutoWriterRunReport
```

职责：

- 检查整章是否和前情摘要、世界观、角色事实矛盾。
- 检查用户原始要求是否整体满足。
- 检查剧情边界是否被突破。
- 检查是否出现过早剧透或提前发生后续事件。
- 汇总逐段 findings 和本地约束命中情况。

第一版只输出报告，不自动重写整章。

原因：

- 整章自动重写风险高，可能覆盖用户满意的局部内容。
- 当前 AutoWriter 已经逐段落盘，整章重写需要更强快照和 diff 体验。
- 只读报告能先提高可解释性，风险最低。

### 第三层：全书级

作为后续能力，不进入第一轮实现：

```text
BookDiagnosis -> BookConsistencyCheck -> PostProcessRoadmap -> Manual/Assisted Fix
```

职责：

- 诊断结构节奏、人物弧光、文风 AI 痕迹。
- 核查全书设定、时间线、伏笔、章间衔接。
- 生成按章节分组的 P0/P1/P2 修改工单。
- 用户选择后再进入局部修订。

## 第一轮实现范围

第一轮建议只做引擎层，不改 UI、不改存储 schema。

### 1. ChapterFactCheck

新增文件：

- `packages/auto-writer-engine/src/chapter-quality.ts`
- `packages/auto-writer-engine/src/__tests__/chapter-quality.test.ts`

建议类型：

```ts
export interface ChapterQualityFinding {
  severity: "info" | "warn" | "error";
  category:
    | "fact"
    | "timeline"
    | "character"
    | "world"
    | "constraint"
    | "plot-boundary"
    | "foreshadow"
    | "style";
  excerpt: string;
  suggestion: string;
}

export interface ChapterFactCheckResult {
  result: "PASS" | "FAIL";
  issues: ChapterQualityFinding[];
  rawText?: string;
}
```

建议函数：

```ts
export function parseChapterFactCheck(raw: string): ChapterFactCheckResult;
export function chapterQualityFindingsToMarkdown(findings: ChapterQualityFinding[]): string;
export function summarizeChapterQuality(findings: ChapterQualityFinding[]): {
  errorCount: number;
  warnCount: number;
  infoCount: number;
};
```

第一版只做解析和汇总，不直接调用模型。模型调用仍由 orchestrator 通过现有 `invokeAgent` 完成。

Prompt 方向：

- 输入：整章正文、前情摘要、章节标题、用户要求、约束清单、角色摘要、世界观摘要。
- 输出：严格 JSON。
- 判定范围限制为客观事实和硬性约束，不把“文笔喜好”当 error。

### 2. AutoWriterRunReport

目标：生成结束后返回一个内存态报告，暂不入库。

建议扩展 `AutoWriterStats`：

```ts
export interface AutoWriterStats {
  totalSegments: number;
  totalRewrites: number;
  totalTokensIn: number;
  totalTokensOut: number;
  startedAt: string;
  finishedAt?: string;
  report?: AutoWriterRunReport;
}
```

建议类型：

```ts
export interface AutoWriterRunReport {
  constraints: {
    requiredTerms: Array<{ term: string; matched: boolean; segmentIndexes: number[] }>;
    forbiddenTerms: Array<{ term: string; matched: boolean; segmentIndexes: number[] }>;
    styleDirectives: string[];
    plotBoundaries: string[];
  };
  segments: Array<{
    index: number;
    beat: string;
    rewriteCount: number;
    acceptedFindingCount: number;
    requiredTerms: string[];
  }>;
  chapterQuality?: {
    status: "not-run" | "pass" | "warn" | "fail";
    findings: ChapterQualityFinding[];
  };
}
```

第一版可以只在 `runAutoWriterPipeline` 内部构造并返回，不需要新 IPC。

收益：

- 不改变 UI 也能在 run `statsJson` 中保留质量信息。
- 后续 UI 可以展示“本次执行了哪些要求、哪些没满足”。
- 能解释为什么发生重写。

### 3. ReferenceTrace

第一版只定义结构，不一定立刻采集全部来源。

建议类型：

```ts
export interface AutoWriterReferenceTrace {
  segmentIndex: number;
  beat: string;
  usedContext: {
    hasExistingChapterText: boolean;
    hasGlobalWorldview: boolean;
    hasPreviousChaptersText: boolean;
    styleSampleSources: string[];
    characterNames: string[];
    worldEntryTitles: string[];
    requiredTerms: string[];
    forbiddenTerms: string[];
  };
}
```

位置：

- 可以先放进 `AutoWriterRunReport.segments[].referenceTrace`。
- 不暴露 provider、token、payload、raw prompt。

收益：

- 满足 InkForge 产品语言原则：用户能看到 AI 使用了哪些资料。
- 后续质量调试更容易定位“为什么模型写偏了”。

## 第二轮实现范围

### 4. WritingConflictAnalysis

触发条件：

- 章节级 `ChapterFactCheck` 连续失败。
- 或逐段重写达到上限后仍有 error。
- 或 `plotBoundaries` 被 ChapterCritic 判定为 error。

第一版建议只做报告，不自动修改。

建议输出：

```ts
export interface WritingConflictAnalysis {
  reconcilable: boolean;
  summary: string;
  rootCause:
    | "outline-history"
    | "constraint-history"
    | "world-history"
    | "foreshadow-outline"
    | "mixed"
    | "other";
  extraConstraints: string;
  suggestedActions: Array<{
    id: "edit-outline" | "adjust-constraints" | "retry" | "keep-draft";
    label: string;
    description: string;
  }>;
}
```

InkForge 映射：

- `edit-outline`：导航到大纲页，不在 AutoWriter 里直接生成最终章节。
- `adjust-constraints`：用户修改本次写作要求或中途修正。
- `retry`：在用户确认后重新跑 AutoWriter。
- `keep-draft`：保留当前稿进入人工编辑。

### 5. ForeshadowCommitments

不急于做完整伏笔数据库。可以先从用户写作要求里抽取轻量承诺：

```ts
export interface PlotCommitment {
  kind: "foreshadow" | "payoff" | "reveal" | "avoid-reveal";
  text: string;
  exactTerms: string[];
  source: "userIdeas" | "correction" | "outline";
}
```

第一版作用：

- 注入 ChapterCritic。
- 进入 AutoWriterRunReport。
- 不做本地硬匹配，除非用户明确列出词条。

## 暂缓项

暂不建议第一轮做：

- 自动整章重写。
- 自动执行全书修改工单。
- 新增完整伏笔页面和存储表。
- 引入 MCP/tool registry。
- 把 prompt preset 外部化。

原因：

- 这些都涉及 UI、IPC、存储或跨模块流程，风险高。
- 当前收益最高的是“检查和解释”，不是“自动大改”。

## 与现有 AutoWriter 的集成点

### pipeline-orchestrator.ts

建议集成顺序：

1. 维护 `acceptedSegments` 数组，记录每段 beat、正文、rewrites、findings、requiredTerms。
2. 生成结束后构建 `AutoWriterRunReport`。
3. 质量模式且非取消状态时，调用章节级 fact check。
4. 将章节级 findings 写入 `stats.report.chapterQuality`。
5. 不改变现有 `applyChapterContent` 行为。

### context-merger.ts

新增：

- `buildChapterFactCheckSystem`
- `buildChapterFactCheckUser`

输入应复用当前 SharedBookContext 和 `PromptConstraintSet`。

### types.ts

新增：

- `AutoWriterRunReport`
- `ChapterQualityFinding`
- `ChapterFactCheckResult`
- `AutoWriterReferenceTrace`

短期可以只扩展 engine 类型，不改 shared IPC 类型。

### auto-writer-service.ts

第一轮无需改 IPC。

可选增强：

- `statsJson` 已经会保存 `stats`，因此 `stats.report` 可随 run 入库。
- UI 后续读取 run 详情时可显示报告。

注意：

- 不要在普通 UI 里显示 provider、endpoint、token、payload。
- 报告文案应使用用户语言，例如“本次使用资料”“已满足要求”“需要复核的问题”。

## 测试计划

### chapter-quality.test.ts

覆盖：

- 解析 `{"result":"PASS","issues":[]}`。
- 解析 `{"result":"FAIL","issues":["..."]}`。
- 解析带结构化 issue 的 JSON。
- Markdown code block 包裹时可解析。
- 非 JSON 时返回 `warn`，不抛出。
- finding 汇总计数稳定。

### pipeline-orchestrator.test.ts

新增：

- 质量模式下，整章完成后运行 ChapterFactCheck。
- 快速模式不运行 ChapterFactCheck。
- ChapterFactCheck 失败不会覆盖已写正文。
- stats.report 包含 required/forbidden 命中情况。
- stats.report.segments 记录 rewriteCount 和 requiredTerms。

### context-merger.test.ts

新增：

- ChapterFactCheck prompt 包含整章正文、前情、约束清单、角色、世界观。
- compact 上下文不会截掉约束清单。
- prompt 明确只把客观事实/硬性约束作为 error。

## 验证命令

第一轮代码实现后至少运行：

```powershell
pnpm --filter @inkforge/auto-writer-engine test
pnpm --filter @inkforge/auto-writer-engine run typecheck
pnpm --filter @inkforge/desktop run typecheck
pnpm typecheck
```

若修改 desktop bundle 或展示报告，再运行：

```powershell
pnpm --filter @inkforge/desktop run build
```

## 实施建议

建议下一步按这个顺序编码：

1. 新建 `chapter-quality.ts`，只实现纯解析、汇总、Markdown 渲染函数。
2. 给 `chapter-quality.ts` 添加单元测试。
3. 扩展 `types.ts` 中的 stats/report 类型。
4. 在 `pipeline-orchestrator.ts` 里先构建 `AutoWriterRunReport`，不调用模型。
5. 测试通过后，再加入 `buildChapterFactCheckUser` 和章节级模型调用。

这样每一步都可独立验证，且不会一次性改动 UI、IPC、storage。
