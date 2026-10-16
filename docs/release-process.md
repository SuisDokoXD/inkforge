# M5-H · 发布候选流程

## beta.26 发布约束

- 原生模块构建统一使用 Node.js 20、pnpm 9 和 Python 3.11；Android CI 使用 Java 21 与 Android Gradle Plugin 8.7.2。
- 根包、桌面包、移动包及 Android `versionName` 必须与 Git 标签版本一致；Android `versionCode` 每次递增。
- 测试和打包前运行 `pnpm verify:release-version v0.1.0-beta.26`。
- Windows、macOS、Linux 桌面包与 Android debug APK 四个构建任务全部成功才允许发布。
- 桌面版保持未签名；Android 附带 debug 签名 APK，仅供侧载测试，不是 Play Store 正式签名。CI debug keystore 不持久化，后续测试版升级可能需要先卸载旧 APK。
- 所有产物必须从对应标签提交重新构建，并由 Release 上传 `SHA256SUMS.txt`；禁止重命名旧安装包发布新版本。

> 版本：0.1.0-beta.0 · 2026-04-21
> 目标读者：第一次打 Release 的维护者

## Step 1. 本地预检

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @inkforge/desktop rebuild electron
pnpm --filter @inkforge/desktop exec electron-builder install-app-deps
pnpm typecheck
pnpm --filter @inkforge/desktop run verify:all
pnpm --filter @inkforge/desktop run build
pnpm --filter @inkforge/desktop run dist:dir
pnpm --filter @inkforge/mobile test
pnpm --filter @inkforge/mobile typecheck
pnpm --filter @inkforge/mobile build
pnpm --filter @inkforge/mobile android:sync
```

全部通过后再继续。

## Step 2. 同步版本号

- 根包、桌面包、移动包与 Android `versionName` 均为 `0.1.0-beta.26`；Git tag 使用 `v0.1.0-beta.26`，Android `versionCode` 从 1 递增至 2。
- `CHANGELOG.md` 记录 beta.26 的功能与验收摘要。
- Android 本地 Gradle 安装器构建需 Java 21 与 Android SDK；Release workflow 在 Ubuntu runner 构建 debug 测试 APK。

## Step 3. 打标签触发 CI

```bash
git add <本次发布文件>
git commit -m "chore(release): 0.1.0-beta.26"
git tag v0.1.0-beta.26
git push origin main
git push origin v0.1.0-beta.26
```

推标签会触发 `.github/workflows/release.yml`：

- Ubuntu verify job 校验版本标签，并运行 typecheck、全仓库 test、移动端测试/typecheck 和 desktop `verify:all`
- Windows / macOS / Ubuntu 分别构建桌面安装包；Windows 额外跑 packaged UI smoke
- Ubuntu Android job 运行 `android:sync`，再以 Java 21 / Gradle 8.11.1 构建 debug 签名 APK
- publish 等待四个平台 job 全部成功，收集合并资产并生成 `SHA256SUMS.txt`
- GitHub Release 附件包括桌面 `.exe` / `.zip` / `.AppImage`、Android `*-android-debug.apk` 及自动更新元数据

## Step 4. 人工检查 + 发布

- 打开 GitHub Releases，确认 Windows / macOS / Linux / Android 测试 APK 产物齐全
- 对照 `SHA256SUMS.txt` 抽查至少一个安装包的 SHA256
- 下载 Windows / Mac 产物运行桌面冒烟；Android APK 仅用于侧载测试（首次安装，之后若 debug 签名变化需卸载旧版）
- 填写 Release Notes（GitHub tag 发布自动生成变更说明，`CHANGELOG.md` 保留详细项目日志）
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
