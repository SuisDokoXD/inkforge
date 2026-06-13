# 安全策略 · Security Policy

## 报告漏洞

**请不要**在公开 Issue 或 Discussion 中讨论尚未公开的安全问题。

- 通过 GitHub 的 [Private vulnerability reporting](https://github.com/SuisDokoXD/inkforge/security/advisories/new) 提交（推荐）
- 或邮件至 `security@inkforge.app`（PGP 公钥可附后跟进）

请在报告中包含：

- 受影响的版本（`关于 InkForge` 中可见，或 `git rev-parse HEAD`）
- 操作系统与运行模式（开发 / 安装包）
- 复现步骤、预期 vs 实际行为
- 影响评估（信息泄露 / 提权 / 任意代码执行 / DoS 等）
- 已知的临时缓解措施（如有）

我们会在 **3 个工作日内确认收到**，并在 **30 天内** 给出修复或说明（重大议题可能更短）。修复发布前请勿公开细节。

## 受支持的版本

| 版本 | 状态 |
|---|---|
| `0.1.x` (当前 beta) | ✅ 接受漏洞报告并发布修复版 |
| 早于 `0.1.0-beta.0` | ❌ 不再维护，请升级 |

## 安全设计概要

InkForge 的核心承诺是**零遥测、本地优先**。已采取的硬约束：

- **零上报**：源码中不引入 Sentry / analytics / crash-report SDK；CI 包含静态扫描确保无新增上报端点
- **API Key 保护**：优先 OS Keychain（`keytar`），回退 AES-256-GCM 加密文件；renderer 永远拿不到明文 Key
- **诊断摘要脱敏**：开发者模式下的诊断摘要按规则脱敏 API Key / Bearer token；用户**主动复制**才离开本机
- **无自动外联**：除用户配置的 Provider / 资料检索端点 / 显式触发的更新检查外，应用不发起任何网络请求
- **CLI 终端权限**：`xterm + node-pty` 继承当前用户权限（这是设计决策，便于本地脚本协作；不在沙箱内）；危险命令前缀（如 `rm -rf`）的二次确认在 roadmap 中

## 我们不会管的（合理边界）

- 用户主动配置的第三方 Provider 自身的安全问题（请直接报告给该 Provider）
- 用户提供的 Skill / 角色卡 prompt 注入风险（这是 LLM 通用问题，文档会持续完善 best practice）
- 在你自己机器上运行 CLI 时输入 `rm -rf /` 之类操作的后果

感谢负责任披露。
