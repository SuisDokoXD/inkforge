# Release Notes 模板

> 每次打 Release 前，把本模板复制到 `CHANGELOG.md` 顶部，填空后用于 `gh release create --notes-file`。

---

## v{X.Y.Z}（{YYYY-MM-DD}）

### 🎯 本次重点

<简短一两句，说明本 release 的定位：Beta 启动 / 功能增补 / 修复累积 / 等>

### ✨ 新功能

- <Milestone 标记 · 一句功能概括 · 影响文件清单（可选）>

### 🔧 改进

- <细节体验 / 性能 / 默认值调整>

### 🐛 修复

- <用户可感知的 bug 修复>

### 🔒 安全 / 隐私

- <若涉及 keystore / 权限 / 日志脱敏变更>

### 💥 破坏性变更

- <迁移 / API 签名 / 数据格式不兼容时必写；给出 upgrade 步骤>

### 📦 升级须知

- <数据库迁移编号：v{N}>
- <配置文件变动：`<key>` 的默认值 {old} → {new}>
- <打包资源增删（如新 native 依赖）>

### 🔨 内部 / DX

- <对贡献者可见的骨架变更 / 新增 workspace package / 测试脚本>

### 📐 验收

- typecheck：{N}/{N} 绿
- `pnpm --filter @inkforge/desktop run verify:all`：{M} 项断言全过
- 手动冒烟：<在哪台机器上跑过、哪些场景>

### 🙏 致谢

<PR / Issue / 试用者 列表>

### 📎 校验和

正式 Release 会自动上传 `SHA256SUMS.txt`。如需把校验和复制进 notes，从该文件粘贴对应行；手动发布时也必须按同样格式列出每个安装/压缩产物。

```
<sha256>  <artifact file name>
```

---

## 如何填写

1. 把本模板复制到 `CHANGELOG.md` 顶部，替换 `{X.Y.Z}` 和日期
2. 翻 `git log v{prev}..HEAD --oneline`，按分类归并
3. 破坏性变更必须单独列「💥 破坏性变更」+ 「📦 升级须知」
4. 验收区实打实写命令行返回，不堆砌绿勾
5. 打 tag：`git tag v{X.Y.Z} && git push --tags`
6. `gh release create v{X.Y.Z} --title "InkForge v{X.Y.Z}" --notes-file CHANGELOG.md [--draft|--prerelease]`；如果走 GitHub Actions release workflow，会自动生成并上传 `SHA256SUMS.txt`

## 版本号规则

- `0.x.y-beta.n`：M5-H 后进入 Beta，面向邀请用户
- `0.x.y-rc.n`：候选发布，除 crash 外不再改
- `1.0.0`：GA，承诺 API（SkillPack v1 / shared IPC）不破坏性变更至 1.x
- Skill 市场（`inkforge-skills`）独立版本号，与主应用解耦

## 与 §13 零上报的关系

Release notes 的「致谢」如需提及 GitHub issue reporter，只能用他们在 issue 里公开的 handle；不得包含任何由应用主动上报的数据（因为根本没有上报通道）。
