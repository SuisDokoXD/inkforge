# Electron 渲染层安全审计

> 日期：2026-06-13
> 范围：`apps/desktop/src/renderer`、`apps/desktop/src/preload`，以及主进程中的窗口外壳、外部链接、终端 IPC 边界。

## 摘要

本轮未发现已确认的 critical 级渲染层 XSS sink。当前 Electron 基线是健康的：renderer sandbox 已启用，Node integration 已关闭，外部导航只允许 HTTP(S)，运行时权限请求默认拒绝。

审计过程中发现并修复了一个高影响防线缺口：终端的 spawn/input IPC 现在由主进程按 `devModeEnabled` 强制拦截，不再只依赖 renderer UI 隐藏。

## 发现项

### R-001 · 已修复 · 终端 IPC 需要主进程开发模式门禁

- 严重性：修复前为 High，本轮已解决。
- 位置：
  - `apps/desktop/src/main/ipc/terminal.ts:22`
  - `apps/desktop/src/main/ipc/terminal.ts:31`
  - `apps/desktop/src/main/ipc/terminal.ts:38`
  - `apps/desktop/src/main/services/terminal-access.ts:1`
- 证据：终端 UI 已按 renderer 状态隐藏，但 preload API 仍暴露 `terminal.spawn` / `terminal.input`。如果未来 renderer 出现 XSS，只靠 UI 隐藏不足以防止注入脚本直接调用 preload 方法。
- 影响：在缺少主进程门禁时，renderer XSS 可能尝试启动本地 shell 或向已有终端会话写入命令。
- 修复：`terminal:spawn` 和 `terminal:input` 现在会先调用 `requireTerminalDevMode()`，再进入 `spawnSession()` 或 `writeInput()`。该检查在主进程读取持久化设置，只有开发模式开启时放行。
- 测试：`apps/desktop/src/main/services/__tests__/terminal-access.test.ts` 覆盖开发模式开启/关闭两条路径。

### R-002 · Low · CSP 仍允许 inline style 和 localhost connect

- 位置：`apps/desktop/src/renderer/index.html:6`
- 证据：当前 CSP 存在，但包含 `style-src 'self' 'unsafe-inline'` 和 `connect-src 'self' ws: http://localhost:*`。
- 影响：这不是可单独利用的漏洞，但如果以后引入 renderer 注入问题，会削弱防御纵深。`http://localhost:*` 对开发环境有用，但打包后的 HTML 里仍然偏宽。
- 建议：可行时区分 dev / packaged CSP。生产包里移除 `http://localhost:*` 和宽泛 `ws:`，除非有明确的打包功能依赖；继续保持 `script-src` 不含 `unsafe-inline` / `unsafe-eval`。只有当未来新增 raw HTML 渲染路径时，再考虑 Trusted Types。

### R-003 · Low / 接受风险 · Web Storage 保存 UI 状态和草稿类内容

- 位置：
  - `apps/desktop/src/renderer/src/stores/app-store.ts:274`
  - `apps/desktop/src/renderer/src/components/ChatPanel.tsx:20`
  - `apps/desktop/src/renderer/src/pages/OnboardingPage.tsx:65`
  - `apps/desktop/src/renderer/src/components/editor/FocusDraftBoard.tsx:31`
- 证据：`localStorage` / `sessionStorage` 用于保存应用视图状态、聊天面板历史、引导页草稿和专注草稿板内容/位置。
- 影响：Web Storage 可被 JavaScript 读取。如果 renderer 将来出现 XSS，这些值也可读。本轮扫描未发现 API Key、模型服务密钥、auth token 或 session 标识存入 Web Storage。
- 建议：继续把密钥保留在主进程 keychain / 本地加密存储路径。任何从 Web Storage 读出的值都按不可信 UI 数据处理，不要扩展成凭证或高权限 IPC payload。

## 已确认的正向控制

- BrowserWindow 加固：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，见 `apps/desktop/src/main/window.ts:114`。
- 新窗口和异常导航默认拒绝；HTTP(S) 链接通过 allowlist helper 外部打开，见 `apps/desktop/src/main/window.ts:124` 和 `apps/desktop/src/main/window.ts:130`。
- 运行时权限请求默认拒绝，见 `apps/desktop/src/main/window.ts:137`。
- `shell.openExternal` 由 `openExternalHttpUrl()` 包装，只接受 `http:` / `https:`，见 `apps/desktop/src/main/external-url.ts:3`。
- renderer 暴露的外部链接 IPC 在打开前经过运行时解析，见 `apps/desktop/src/main/ipc/validation/external.ts:13`。
- 静态扫描在审计范围内未命中这些高危模式：`dangerouslySetInnerHTML`、`innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`、`eval(`、`new Function`、`DOMParser`、`createContextualFragment`、`allowDangerousHtml`、`rehype-raw`、`postMessage`。

## 后续清单

- 继续扩展 IPC 运行时校验，重点关注文件路径、进程类能力、导入导出、模型服务配置和外部链接。
- 如果在 TipTap / React 默认 escaping 之外新增 Markdown/HTML 预览，必须使用 allowlist sanitizer，并明确 raw HTML 是否禁用。
- 首次更大范围公测前做一次 production CSP 收敛：移除打包环境不需要的 localhost connect，或写明具体需要它的生产功能。
- 终端能力必须同时在 renderer UI 和主进程 IPC 层保持开发模式限定；不要只依赖 preload 隐藏。
