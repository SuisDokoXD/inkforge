# M5-H · 发布候选流程

> 版本：0.1.0-beta.0 · 2026-04-21
> 目标读者：第一次打 Release 的维护者

## Step 1. 本地预检

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @inkforge/desktop rebuild electron
pnpm --filter @inkforge/desktop exec electron-builder install-app-deps
pnpm typecheck                                              # 17/17
pnpm --filter @inkforge/desktop run verify:all              # 60 断言
pnpm --filter @inkforge/desktop run build                   # Electron Vite
pnpm --filter @inkforge/desktop run dist:dir                # 本机试打包（不生成安装器）
```

全部通过后再继续。

## Step 2. 同步版本号

- `apps/desktop/package.json` `version` → `0.1.0-beta.0`（或后续升）
- `CHANGELOG.md` 顶部复制模板，填空

## Step 3. 打标签触发 CI

```bash
git commit -am "chore(release): 0.1.0-beta.0"
git tag v0.1.0-beta.0
git push origin main v0.1.0-beta.0
```

推标签会触发 `.github/workflows/release.yml`：

- 先在 ubuntu runner 上跑 `pnpm typecheck`、`pnpm test` 和 desktop `verify:all`
- 再在 windows / macos / ubuntu runner 上分别运行 `electron-builder`
- Windows 产物会额外跑 packaged UI smoke：系统启动 `win-unpacked/InkForge.exe`，通过 CDP 检查真实 packaged renderer、preload API 和 workspace 数据库
- 生成 `apps/desktop/release/` 下的产物（当前 CI 默认：Windows `.exe`、macOS `.zip`、Linux `.AppImage`，以及 `latest*.yml` / `.blockmap` 更新元数据）
- publish job 会为下载产物生成 `SHA256SUMS.txt`，再创建正式 GitHub Release 并上传产物
- publish 对 macOS 宽容：Windows + Linux 成功即可发布；macOS 成功时会自动包含 macOS 产物

## Step 4. 人工检查 + 发布

- 打开 GitHub Releases，确认三平台产物齐全
- 对照 `SHA256SUMS.txt` 抽查至少一个安装包的 SHA256
- 下载 Windows / Mac 各至少一个产物，跑一遍欢迎向导 + 写 200 字 + 生成日报
- 填写 Release Notes（`docs/release-notes.md` 模板）
- 如果是手动触发且选择了 draft，先点击 "Publish release"；tag 推送则会直接发布

## Step 5. 发布后观察

- 48 小时内盯 GitHub Issues（推荐打 `triage` 标签）
- 如出现严重崩溃：
  - 小问题 → 直接出 0.1.0-beta.1
  - 大问题 → 在 Release 页标 "pre-release / yanked"，并在 README 顶部挂 banner

## 签名（留待 0.1.0 稳定版）

未签名版本在用户机器上会弹 SmartScreen / Gatekeeper 警告。正式签名需要：

- **Windows**: 购买 code signing 证书（EV 更丝滑），export 为 `.pfx` → GitHub Secrets 里放 `CSC_LINK`（base64）+ `CSC_KEY_PASSWORD`
- **macOS**: Apple Developer 账号 → Developer ID Application 证书 → notarization 需要 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`
- **Linux**: AppImage 无需签名；deb 如需 apt repo 签名，用 gpg key

当前 workflow 明确按未签名 beta 发布：`CSC_IDENTITY_AUTO_DISCOVERY=false`，并且 `apps/desktop/package.json` 的 Windows 配置为 `signAndEditExecutable=false`。等确认证书和密钥管理流程后，再单独启用签名变量，不要在 beta 流程里半接入签名。
