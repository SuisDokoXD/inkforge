# InkForge 产品价值验证报告

> 日期：2026-06-14
> 范围：本地优先写作闭环、AutoWriter / Review mock LLM 链路、Electron e2e、Windows unpacked 启动与 packaged UI smoke、可验证的产品假设。真实模型输出质量和真人试用尚未完成。

## 本轮结论

本轮能证明：InkForge 的本地优先写作闭环已经可以在 Electron 测试环境中真实跑通；AutoWriter 和 Review 的主进程模型调用路径也可以在 deterministic mock LLM 下端到端跑通。测试覆盖项目元数据、章节正文、人物、世界条目、素材、样本库、手动快照、章节日志、Markdown 导出、AutoWriter 多 Agent 流水线、Review 报告，以及重载后的章节可见性。

本轮不能证明：AutoWriter 在真实模型上的长文质量、普通 AI 聊天对比收益、真人首次使用成功率。这些需要固定样例、真实模型服务和用户试用。Windows unpacked 目录版已做本机进程级启动和 packaged UI smoke，但这仍不等于签名安装包在干净机器上的安装/升级/卸载体验已成熟。

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

- 如果“导出作品正文”是目标，当前行为合理。
- 如果“导出完整项目备份”是目标，需要另做项目包导出，包含数据库元数据、章节、素材、人物、世界观、样本库和快照索引。

## 还没有证明的产品价值

| 待证明项 | 为什么还没证明 | 下一步 |
|---|---|---|
| AutoWriter 真实输出质量 | deterministic mock LLM 只能证明流程，不代表真实模型长文质量 | 使用固定真实模型跑样例评分 |
| 比普通 AI 聊天更省上下文整理成本 | 需要同题对照实验 | 固定任务，记录准备时间、粘贴资料量、错误数、修改耗时、可保留比例 |
| 真人首次使用成功率 | 需要真实或半真实用户 | 找 1-3 人独立完成第一章流程，记录卡点 |
| 签名安装包首次启动 | 本轮只验证了本机 unpacked 目录版进程级启动 | 用未签名安装包或后续签名安装包在干净 Windows 用户环境跑安装、启动、卸载 |

## 下一轮验证标准

下一轮要把“可运行”推进到“真的有用”，建议按下面标准验收：

| 维度 | 通过标准 |
|---|---|
| 第一章闭环 | 新用户 30 分钟内完成新建项目、写一章、快照、导出 |
| AutoWriter 保留率 | 固定样例中生成内容至少 60% 可保留或轻改 |
| 人物一致性 | 严重 OOC 每章不超过 1 处 |
| 世界观一致性 | 明确违反设定不超过 1 处 |
| 对比普通 AI 聊天 | 上下文准备时间减少 30% 以上，明显设定错误减少 |
| 用户留存意愿 | 试用者愿意第二天继续打开同一个项目写作 |

## 当前判断

InkForge 现在已经能证明本地写作资产闭环成立：项目、正文、设定、素材、快照、日志和导出不是散落的演示功能，而是能在同一个 Electron 应用里通过真实 API 串起来。AutoWriter 和 Review 也已经从“只有纯逻辑验证”推进到“真实主进程 IPC + 模型运行时 + 落库”的自动化证明。

下一步真正决定产品价值的是真实模型下的 AutoWriter 质量、对普通聊天窗口的效率收益，以及用户首次使用成功率。那部分不能靠 mock e2e 代替。
