<p align="center">
  <img src="assets/banner.svg" alt="InkForge" width="100%" />
</p>

# InkForge

InkForge 是一款面向长篇写作者的本地 AI 写作工作台。

它把章节写作、资料整理、人物与世界设定、自动写作、全文审查和导出放在同一个桌面应用里。它更像一间安静的书房，而不是一个不断打断你的聊天窗口。

作品正文、素材、数据库和模型凭证优先保存在本机。你可以自行备份、迁移，也可以把作品目录交给自己信任的同步工具管理。

## 适合谁

- 正在写小说、剧本、连载长文或非虚构长稿的人
- 需要同时管理多本书、多章节、多条人物线的人
- 想使用 AI 辅助，但不希望作品资料散落在聊天记录里的人
- 重视本地保存、可备份、可迁移的人

## 主要能力

- 写作：章节编辑、自动保存、快照、Markdown 导入导出
- 目录：章节树、小标题同步、点击小标题跳转正文位置
- 素材：灵感、片段、资料、设定、随笔的集中管理
- 人物：人物档案、自动来信、关系与设定辅助
- 世界：世界条目、关系图、资料包与设定融合
- AI：多模型接入、场景化模型绑定、选中文本改写与审查
- 自动写作：章节简报、快速出稿、严谨校阅、分段续写
- 审查：人物一致性、时间线、伏笔、世界观、语言风格
- 备份：`.inkforge.zip` 项目备份包，可把项目导入为新项目
- 本地：SQLite 与 Markdown 文件，作品数据不依赖云端账号

## 使用方式

### 下载

前往 [GitHub Releases](https://github.com/SuisDokoXD/inkforge/releases) 下载对应平台的安装包。请只从这个页面下载 beta 版本，不要使用第三方转载包。

每次 Release 都会附带 `SHA256SUMS.txt`。下载后可以用下面的命令核对安装包是否完整，输出值应与 `SHA256SUMS.txt` 中对应文件一致：

```powershell
Get-FileHash .\InkForge-*-setup.exe -Algorithm SHA256
```

Windows beta 版本目前未做代码签名，首次运行时 SmartScreen 可能提示“Windows 已保护你的电脑”。确认文件来自上面的 GitHub Releases 且 SHA256 校验一致后，可点击“更多信息”→“仍要运行”。正式写作前仍建议先备份作品目录；InkForge 还在 beta 阶段，数据结构可能继续演进。

### 从源码运行

需要先安装 Node.js 20+ 与 pnpm 9+。Windows 环境还需要可用的本地编译工具链。

```powershell
pnpm install
pnpm --filter @inkforge/desktop dev
```

常用检查命令：

```powershell
pnpm --filter @inkforge/shared build
pnpm --filter @inkforge/storage build
pnpm --filter @inkforge/auto-writer-engine build
pnpm --filter @inkforge/desktop typecheck
pnpm --filter @inkforge/desktop build
```

## 数据位置

- 正文：`<workspace>/projects/<name>/chapters/*.md`
- 数据库：`<workspace>/inkforge.db`
- 快照：`<project>/.history/snapshots/`
- 封面与素材：项目目录内
- API Key：优先使用系统 Keychain，必要时回退到本地加密文件

InkForge 不提供云同步。建议使用网盘、Git、外部硬盘或自己的备份方案保存作品目录。

如果需要跨工作区迁移完整项目，可以在导出弹窗中使用“项目备份包”。项目包会包含项目元数据、章节正文、人物、世界观、素材、参考库、版本备份和日志；不会包含模型服务密钥、工作区配置或真实模型 proof 输出。格式和导入边界见 [项目备份包设计](docs/project-package-export-design.md)。

## 设计取向

- 本地优先：作品和资料先保存在自己的电脑上
- 少打扰：AI 建议进入时间线，用户决定是否采纳
- 可整理：章节、小标题、素材、人物、设定都有固定归处
- 可回退：快照和自动保存尽量降低误操作成本
- 可替换：模型供应商可配置，避免绑定单一服务

## 技术栈

InkForge 使用 Electron、React、TypeScript、TipTap、better-sqlite3、Tailwind CSS 与 pnpm workspace 构建。

## 状态

项目仍处于 beta 阶段，界面、功能和数据结构还会继续调整。正式使用前，请保持作品目录备份。

## 验证状态

最近一次本地验证见 [InkForge 验证报告](docs/validation-report.md)。

安全边界和后续审计重点见 [InkForge 威胁模型](docs/inkforge-threat-model.md)。

已通过的机器验证包括：

- `pnpm --filter @inkforge/desktop run sqlite:node`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm --filter @inkforge/desktop run verify:all`
- `pnpm --filter @inkforge/desktop run verify:project-package`
- `pnpm --filter @inkforge/desktop run sqlite:electron`
- `pnpm --filter @inkforge/desktop run e2e`
- `pnpm --filter @inkforge/desktop exec electron-builder --dir --config.directories.output=release-verify-20260614-0005 --publish never`
- `$env:INKFORGE_RUN_PACKAGED_UI="1"; pnpm --filter @inkforge/desktop run e2e:packaged`

`better-sqlite3` 是 native 模块：跑 Node 侧单测和 verify 前需要切到 Node ABI，跑 Electron e2e、打包或桌面版前需要切回 Electron ABI。上述检查证明当前仓库的类型契约、单元测试、生产构建、数据库迁移、核心守门脚本、本地写作闭环 e2e、AutoWriter / Review mock LLM 主进程链路，以及 Windows unpacked 目录版构建和 packaged UI smoke 可以通过。产品侧的第一轮验证见 [InkForge 产品价值验证报告](docs/product-validation-report.md)。

2026-06-14 还完成了一条真实模型 AutoWriter 短样例烟测：`quality` 模式下 Planner / Writer / Critic / Reflector 全阶段完成，2 段生成成功，硬性线索覆盖 6/6，无无关文本，重复章节标题被兜底去除。这个结果证明固定短样例和调参后的写作闭环可跑通。

同日追加了一次真实模型长篇连续 smoke：同一测试项目连续生成 3 章，每章 `quality` 模式 5 段，合计 15 段、约 1.8 万个非空白字符，3/3 章完成 Planner / Writer / Critic / Reflector / done 全阶段，未命中禁忌直揭、未重复章节标题。机器严格短语评分为 1/3 章全通过，另外两章的缺项是“第二枚”和“朱砂印”分开表达、以及“真实的记忆”替代“真实记忆”。这个结果证明长篇连续技术闭环可跑通，但仍不等同于真实长文质量、与普通 AI 聊天窗口的效率收益、真人首次使用体验或签名安装包在干净机器上的安装体验已经被充分证明。

同日还跑了一轮 3 题材真实模型同题对照 proof suite：AutoWriter、普通聊天最小提示、普通聊天完整上下文提示在同一模型下各跑 3 个任务。AutoWriter 3/3 完成，机器规则通过 1/3，平均机器评分 96，平均估算保留率 0.96；两个聊天基线平均评分和保留率同为 96 / 0.96，但墙钟耗时明显更短。这个结果证明 AutoWriter 可以产出与聊天基线同级的机器评分草稿，并减少约 511 个手工上下文拼接字符；它不证明 AutoWriter 生成更快，也不替代真人作者对修改耗时、人物一致性、世界观一致性和文风满意度的判断。

后续真实模型验证流程已固化到 [真实模型验证流程](docs/real-model-validation.md)。默认 CI 不调用真实模型，只检查 proof runner 语法；源码入口 e2e 和 Windows packaged UI smoke 已作为 CI / Release 守门项。

真实模型 proof JSON 默认保存在 `output/playwright/real-model-eval/`，不纳入仓库。可用下面的命令把最近一次 proof JSON 汇总成 Markdown 报告：

```powershell
pnpm --filter @inkforge/desktop run proof:report
```

新 proof runner 已在本机跑过一次：AutoWriter 3 题材 3/3 完成，机器规则 1/3 通过，平均机器评分 96，估算保留率 0.96；Review 真实模型链路 completed，产出 8 条 findings 并成功导出 Markdown 报告。由于第二个已保存模型服务返回 403 余额不足，本轮只实际验证到 1 个可用模型服务，不能把它写成多模型稳定性已证明。

## License

[MIT](LICENSE)
