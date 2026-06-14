# InkForge 产品价值验证报告

> 日期：2026-06-14
> 范围：本地优先写作闭环、AutoWriter / Review mock LLM 链路、Electron e2e、Windows unpacked 启动与 packaged UI smoke、AutoWriter 真实模型短样例烟测、真实模型 3 章连续 smoke、3 题材真实模型同题对照 proof suite、可验证的产品假设。真人试用和干净机器安装体验尚未完成。

## 本轮结论

本轮能证明：InkForge 的本地优先写作闭环已经可以在 Electron 测试环境中真实跑通；AutoWriter 和 Review 的主进程模型调用路径也可以在 deterministic mock LLM 下端到端跑通。测试覆盖项目元数据、章节正文、人物、世界条目、素材、样本库、手动快照、章节日志、Markdown 导出、AutoWriter 多 Agent 流水线、Review 报告，以及重载后的章节可见性。

本轮新增证明：AutoWriter 在一条固定短样例上可以调用真实配置模型完成 `quality` 写作闭环，且调参后能覆盖用户硬性线索并避免明显跑题；随后又在同一测试项目中连续生成 3 章，证明长篇连续技术链路可以跑通；最后追加 3 题材同题 proof suite，把 AutoWriter 与两种普通聊天基线放在同一模型下对照评分。结果显示：AutoWriter 的机器评分和估算保留率已经达到聊天基线同级，但墙钟耗时明显更长，收益主要体现在结构化项目自动组织上下文，而不是生成速度。本轮仍不能证明真人首次使用成功率、长期多模型稳定性、真实作者人工保留率，或签名安装包在干净机器上的安装/升级/卸载体验已经成熟。

## 真实模型短样例调参

2026-06-14 使用本机已配置的写作模型服务做了 AutoWriter 短样例烟测。测试不读取、不输出 API Key，只通过 InkForge preload API 使用已保存的模型服务配置。

调参内容：

- 默认 AutoWriter 从“快速出稿”调整为 `quality` 闭环：约 650 字/段、5 段、每段最多回炉 1 次、一致性检查开启。
- 快速模式保留为显式选择：约 700 字/段、7 段、跳过逐段校阅和回炉。
- Planner / Writer / Critic / Reflector 加入角色默认生成参数：结构和审稿低温，正文写作保留适度创造性。
- Writer prompt 直接注入用户原始写作简报，避免 Planner 漏传“必须提到”的硬性约束。
- Critic 把“必须、要求、不要、不得、禁止、不能”升级为硬性验收项。
- 引擎兜底剔除生成段开头重复的既有章节标题。

最终短样例结果：

| 指标 | 结果 |
|---|---|
| 模型服务 | 已保存配置：`DeepSeek` 标签，`anthropic` vendor，`claude-sonnet-4-6` |
| 模式 | `quality` |
| 目标 | 2 段、约 380 字/段、最多回炉 1 次 |
| 完成状态 | `completed` |
| 阶段 | Planner、Writer、Critic、Reflector、done 全部执行 |
| 生成规模 | 796 个非空白字符，17 个自然段 |
| 硬性线索覆盖 | 6/6：沈青禾、阿迟、陆闻舟、松脂味、真实记忆、小名 |
| 明显无关文本 | 0 |
| 重复章节标题 | 未出现 |
| 直接揭露师父去向 | 未出现 |

记录文件位于忽略目录：

```text
output/playwright/real-model-eval/autowriter-calibration-2026-06-14T03-06-23-949Z.json
```

解释边界：这是一条 Codex operator 固定短样例自测，能证明调参后的真实模型链路、硬性约束传递和标题去重兜底有效；它不能证明不同题材、不同模型、真实作者保留率或与普通聊天窗口的时间收益。

## 真实模型长篇连续 smoke

同日追加了一次长篇连续 smoke。测试仍然不读取、不输出 API Key，只通过 Electron preload API 使用已保存的模型服务配置。

测试方式：

1. 新建专用测试项目。
2. 写入悬疑武侠题材、全局世界观、5 个角色和 4 条世界规则。
3. 连续创建 3 个章节，每章都写入初始正文和关联大纲卡。
4. 每章通过真实 `auto-writer:start` IPC 启动 `quality` 模式。
5. 每章目标 5 段、约 650 字/段、每段最多回炉 1 次、一致性检查开启。
6. 监听 Planner / Writer / Critic / Reflector / done 阶段事件，生成后读回章节正文、快照和章节日志。

结果摘要：

| 指标 | 结果 |
|---|---|
| 测试章节 | 3 章连续生成：雨夜来信、黑伞客、镜井回声 |
| 完成状态 | 3/3 `completed` |
| 阶段链路 | 3/3 章 Planner、Writer、Critic、Reflector、done 全部执行 |
| 生成规模 | 15 段，约 18,268 个非空白字符 |
| 章节规模 | 第 1 章 5,346 字符；第 2 章 5,278 字符；第 3 章 7,644 字符 |
| 改写次数 | 0 次；Critic 没有触发回炉 |
| 禁忌直揭 | 0：未直接揭露顾照夜下落、生死或真实身份 |
| 重复章节标题 | 0 |
| 机器严格短语评分 | 1/3 章全通过；第 2 章漏掉精确短语“第二枚朱砂印”，正文实际出现“第二枚”和“朱砂印”；第 3 章漏掉精确短语“真实记忆”，正文实际出现“真实的记忆” |
| token 统计 | 仍为 0，说明该 provider 路径没有返回或当前提取逻辑没有拿到 usage |

记录文件位于忽略目录：

```text
output/playwright/real-model-eval/autowriter-longform-2026-06-14T03-39-19-562Z.json
```

解释边界：这次能证明真实模型下的长篇连续技术闭环、跨章上下文读取、章节落盘、快照/日志和阶段事件没有断裂；它仍不能证明文学质量稳定、每章都达到可直接发布、不同题材都稳定、或比普通聊天窗口显著省时。

## 真实模型同题对照 proof suite

同日追加了一轮 3 题材同题对照 proof suite。测试不读取、不输出 API Key，只通过 InkForge 已保存的模型服务配置调用真实模型。

测试方式：

1. 准备 3 个固定题材：悬疑武侠、近未来科幻、都市现实。
2. 每个题材都先写入项目简介、全局世界观、人物、世界条目、素材和大纲卡。
3. 对同一写作任务分别运行三条路径：AutoWriter `quality` 三段闭环、普通聊天最小提示、普通聊天完整上下文提示。
4. 用同一套机器规则评分：必需线索覆盖、禁忌内容命中、是否完成、估算可保留比例。
5. 记录手工提示字符量、模型返回耗时、生成正文长度、AutoWriter 阶段事件、快照和章节日志。

结果摘要：

| 指标 | AutoWriter | 普通聊天：最小提示 | 普通聊天：完整上下文 |
|---|---:|---:|---:|
| 用例数 | 3 | 3 | 3 |
| 完成数 | 3/3 | 3/3 | 3/3 |
| 机器规则通过数 | 1/3 | 2/3 | 2/3 |
| 平均机器评分 | 96 | 96 | 96 |
| 平均估算保留率 | 0.96 | 0.96 | 0.96 |
| 总耗时 | 455.1 秒 | 99.1 秒 | 70.6 秒 |
| 禁忌内容命中 | 0 | 0 | 0 |

额外观察：

- 结构化项目资料让 AutoWriter 相比“完整上下文聊天提示”平均少手工拼接约 511 个上下文字符。
- AutoWriter 三个用例都完整经过 Planner / Writer / Critic / Reflector / done，并落库章节正文、快照和章节日志。
- AutoWriter 只有 1/3 达到机器严格通过，是因为 2 个用例存在严格短语级必需线索未命中；这类检查偏机械，仍需要人工判定语义等价和可改成本。
- 普通聊天在墙钟时间上明显更快；AutoWriter 的价值不应表述为“生成更快”，而应表述为“自动从项目结构取上下文、分段产出、校阅和落库，减少作者整理资料和保存结果的手工步骤”。

记录文件位于忽略目录：

```text
output/playwright/real-model-eval/autowriter-proof-suite-2026-06-14T04-06-12-050Z.json
```

解释边界：这轮 proof suite 初步证明 AutoWriter 在 3 个题材上可以产出与普通聊天基线同级的可用草稿，并且减少手工上下文拼接；它不能证明 AutoWriter 比聊天窗口生成更快，也不能替代真人作者对人物一致、世界观一致、文风满意度和实际修改时间的评分。

## 后续 proof 流程固化

已新增仓库内脚本：

```powershell
pnpm --filter @inkforge/desktop run proof:real-model
```

脚本位置：

```text
apps/desktop/scripts/run-real-model-proof-suite.cjs
```

它把第 2 点和第 6 点变成可复现流程：

- AutoWriter 多题材、多模型候选验证：最多选择 2 个本机可用模型服务，每个服务运行固定题材样例，记录完成数、机器规则通过数、平均机器评分、估算保留率、硬性线索漏传和禁忌命中。
- Review 真实模型验证：创建一个故意包含人物口吻突变、世界规则冲突、过早揭露的章节，运行真实 `review:run`，记录 findings 数、严重度统计和 Markdown 报告导出是否可用。

完整说明见：

```text
docs/real-model-validation.md
```

解释边界：默认 CI 不调用真实模型，不需要 API Key；真实模型 proof 仍是手动命令，会产生费用。若本机只有 1 个可用模型服务，结果只能证明“多题材”，不能证明“多模型”。

本轮已实际运行一次新脚本：

```text
output/playwright/real-model-eval/real-model-proof-suite-2026-06-14T05-35-16-915Z.json
```

结果摘要：

| 指标 | 结果 |
|---|---|
| 计划模型服务数 | 最多 2 个 |
| 实际可用模型服务数 | 1 个；另一个已保存服务测试返回 403 余额不足，未纳入 |
| AutoWriter 用例 | 3 个题材 |
| AutoWriter 完成数 | 3/3 |
| AutoWriter 机器规则通过数 | 1/3 |
| AutoWriter 平均机器评分 | 96 |
| AutoWriter 平均估算保留率 | 0.96 |
| 禁忌内容命中 | 0 |
| 严格短语漏传 | 2 项：近未来科幻漏“穹顶城”，都市现实漏“旧照相馆” |
| Review 真实模型链路 | completed |
| Review findings | 8 条 |
| Review Markdown 导出 | 通过 |

解释边界：这次把第 6 点“Review 真实模型验证”补上了，也再次证明 AutoWriter 多题材技术闭环可跑通；但由于只有 1 个服务可用，第 2 点的“多模型”部分仍只能算流程已支持、当前环境未充分证明。

## 新增自动化证明

新增 e2e：

- `apps/desktop/e2e/local-first-writing-loop.spec.ts`
- `apps/desktop/e2e/auto-writer-mock.spec.ts`
- `apps/desktop/e2e/packaged-ui.spec.ts`

它通过 preload API 执行以下链路：

1. 设置欢迎向导已完成。
2. 新建项目，并写入简介、题材、标签、全局世界观。
3. 新建章节并写入正文 Markdown。
4. 读回章节正文，确认正文落盘。
5. 新建人物档案。
6. 新建世界条目。
7. 新建素材。
8. 新建文风样本库。
9. 创建手动快照，并读回快照正文。
10. 写入章节日志，并读回日志列表。
11. 导出项目 Markdown，并确认导出文件存在且包含章节正文。
12. 重载窗口，确认章节仍能在写作页看到。

`auto-writer-mock.spec.ts` 通过 `INKFORGE_MOCK_LLM=1` 执行以下链路：

1. 使用真实 preload API 创建项目、章节、人物和世界条目。
2. 通过真实 `auto-writer:start` IPC 启动 AutoWriter。
3. main 进程模型运行时返回确定性的 Planner JSON、Writer 正文、Critic JSON 和 Reflector 备忘。
4. AutoWriter 写入章节正文，创建快照，写入章节日志和 token 统计。
5. 通过真实 `review:run` IPC 启动 Review。
6. Review 使用同一 mock LLM 返回 finding，完成报告汇总。
7. 重载窗口，确认生成章节仍可见。

`packaged-ui.spec.ts` 通过 `INKFORGE_RUN_PACKAGED_UI=1` 执行以下链路：

1. 启动真实 Windows unpacked `InkForge.exe`。
2. 使用独立 appdata 和 `--remote-debugging-port`。
3. 通过 Playwright CDP 连接 packaged renderer。
4. 断言页面来自 `resources/app.asar/out/renderer/index.html`。
5. 断言主界面、preload API 和 workspace 数据库初始化正常。

## 本轮验证命令

```powershell
pnpm --filter @inkforge/desktop run e2e
$env:INKFORGE_RUN_PACKAGED_UI="1"; pnpm --filter @inkforge/desktop run e2e:packaged
```

结果：

```text
pnpm --filter @inkforge/desktop run e2e
9 passed, 1 skipped

$env:INKFORGE_RUN_PACKAGED_UI="1"; pnpm --filter @inkforge/desktop run e2e:packaged
1 passed
```

通过项包括：

- 6 条基础 smoke。
- 1 条角色导入/资料/酒馆入口视觉路径。
- 1 条新增本地写作闭环。
- 1 条新增 AutoWriter / Review mock LLM 闭环。
- 1 条单独运行的 packaged UI smoke。

## 证明了什么

| 假设 | 本轮结果 | 证据 |
|---|---|---|
| 应用打包入口能启动 | 已证明 | e2e 先执行 `electron-vite build`，再通过 Playwright Electron 启动 `out/main/index.js` |
| 项目和章节能本地创建 | 已证明 | e2e 创建项目、章节并读回 |
| 正文能保存到本地并读回 | 已证明 | `chapter.update` 写入，`chapter.read` 读回，断言正文包含关键句 |
| 人物/世界观/素材可结构化保存 | 已证明 | e2e 创建并 list 回人物、世界条目、素材、样本库 |
| 快照可创建并读回正文 | 已证明 | e2e 创建手动快照并读取快照内容 |
| 写作日志可记录 | 已证明 | e2e 写入章节日志并读取列表 |
| Markdown 导出可生成文件 | 已证明 | e2e 使用指定 `outputPath` 导出，并读取文件断言正文存在 |
| AutoWriter 主进程链路可跑通 | 已证明 | `INKFORGE_MOCK_LLM=1` 时，e2e 启动真实 `auto-writer:start`，完成 2 段生成、快照、章节日志和 token 统计 |
| Review 主进程链路可跑通 | 已证明 | e2e 启动真实 `review:run`，mock LLM 返回 finding，报告状态完成 |
| 重载后工作区仍可见 | 已证明 | e2e 写入 store 后 reload，断言章节标题可见 |
| Windows unpacked 目录版可构建 | 已证明 | `electron-builder --dir` 输出 `release-verify-20260614-0005/win-unpacked/InkForge.exe` |
| Windows unpacked 目录版本机可启动 | 部分证明 | 系统方式启动 `InkForge.exe`，8 秒后进程仍存活，并生成 workspace 数据库；未验证安装器和干净机器 |
| Windows unpacked 目录版 packaged UI 可自动化检查 | 已证明 | `e2e:packaged` 启动真实 `InkForge.exe`，通过 CDP 连接 packaged renderer，断言主界面、preload API 和 workspace 数据库 |

## 发现的产品边界

项目 Markdown 导出当前只导出章节正文，不导出世界观、人物、素材、样本库等结构化资料。本轮测试最初假设导出文件会包含世界观「雨声茶馆」，失败后确认这是当前实现边界，并把断言改为导出章节正文。

这个边界不一定是 bug，但需要产品决策：

本轮产品决策：当前 TXT / Markdown / HTML / DOCX / EPUB 明确定位为“作品正文导出”，不冒充完整项目备份。导出弹窗已改成“导出作品正文”，并说明人物、世界观、素材、快照和日志会留在本地项目中。

如果后续要做“完整项目迁移/备份”，应新增独立的项目包导出，而不是塞进现有正文导出按钮。项目包至少要包含数据库元数据、章节 Markdown、人物、世界观、素材、样本库、快照索引和版本信息。

## 还没有证明的产品价值

| 待证明项 | 为什么还没证明 | 下一步 |
|---|---|---|
| AutoWriter 真实输出质量 | 已完成固定短样例、3 章连续 smoke、3 题材同题对照；机器评分平均 96，估算保留率 0.96，但还不能代表长期质量稳定 | 扩展到更多题材、多模型、真实作者人工保留率评分 |
| 比普通 AI 聊天更省上下文整理成本 | 已完成一轮自动化同题对照，证明平均少手工拼接约 511 个上下文字符；但尚未证明真人总耗时更少 | 固定任务，记录作者准备时间、粘贴资料量、修改耗时、明显错误数、可保留比例 |
| 真人首次使用成功率 | 需要真实或半真实用户 | 找 1-3 人独立完成第一章流程，记录卡点 |
| 签名安装包首次启动 | 本轮只验证了本机 unpacked 目录版进程级启动 | 用未签名安装包或后续签名安装包在干净 Windows 用户环境跑安装、启动、卸载 |

## 下一轮验证标准

下一轮要把“可运行”推进到“真的有用”，建议按下面标准验收：

| 维度 | 通过标准 |
|---|---|
| 第一章闭环 | 新用户 30 分钟内完成新建项目、写一章、快照、导出 |
| AutoWriter 保留率 | 多题材、多模型样例中生成内容至少 60% 可保留或轻改 |
| 人物一致性 | 严重 OOC 每章不超过 1 处 |
| 世界观一致性 | 明确违反设定不超过 1 处 |
| 对比普通 AI 聊天 | 真人同题任务中上下文准备时间减少 30% 以上，明显设定错误减少，且总修改耗时不增加 |
| 用户留存意愿 | 试用者愿意第二天继续打开同一个项目写作 |

## 当前判断

InkForge 现在已经能证明本地写作资产闭环成立：项目、正文、设定、素材、快照、日志和导出不是散落的演示功能，而是能在同一个 Electron 应用里通过真实 API 串起来。AutoWriter 和 Review 也已经从“只有纯逻辑验证”推进到“真实主进程 IPC + 模型运行时 + 落库”的自动化证明。

下一步真正决定产品价值的是更长期、多模型的 AutoWriter 人工保留率，对普通聊天窗口的真人效率收益，以及用户首次使用成功率。那部分不能靠 mock e2e、单次长篇 smoke 或一次自动化 proof suite 代替。
