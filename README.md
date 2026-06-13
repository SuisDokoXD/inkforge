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

## License

[MIT](LICENSE)
