# 贡献指南 · Contributing to InkForge

感谢你愿意为 InkForge 投入时间。本文是给"想动手改代码或提交 Skill"的人看的；只是想报 Bug 请直接到 [Issues](https://github.com/SuisDokoXD/inkforge/issues/new/choose)。

---

## 提交 Issue 之前

- 先搜一下已有 Issue / Discussions，避免重复
- 复现步骤越短越好：版本号、操作系统、最少操作序列
- 涉及行为异常时请打开"开发者模式 → 复制诊断摘要"粘贴进 Issue（API Key 已自动脱敏）
- 安全漏洞请走 [SECURITY.md](SECURITY.md)，**不要**公开开 Issue

---

## 本地开发

前置：Node 20+, pnpm 9+, 系统具备 C++ 工具链。

```bash
pnpm install
pnpm typecheck                                       # 全包 TS 检查
pnpm --filter @inkforge/desktop run verify:all       # 92 项断言
pnpm --filter @inkforge/desktop dev                  # Electron dev
```

代码改动建议遵循以下原则：

- **保持类型完整**：禁止 `as any`，确实需要时附上一行注释解释 *why*
- **不引入网络上报**：本项目核心承诺是零遥测，任何 fetch/axios 请确保仅指向用户配置的端点
- **写敢删的代码**：去掉一个文件能跑通就别留兼容层
- **增量改 IPC**：`packages/shared/src/ipc.ts` 是契约层，改它会拉动整条链路（preload → renderer api → main handler）；改前先在 PR 描述里画一遍调用图

---

## 提交规范

按 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 写 commit message：

```
feat(skill-engine): 支持 every-n-paragraphs 触发
fix(editor): 切章时 autosave 残留导致 race condition
docs(architecture): 补充 §5.4 持久化加固说明
chore(deps): 升级 better-sqlite3 到 11.6
```

`scope` 用包名后半段或子领域；正文里写清"为什么这样改"（不是"改了什么"——diff 已经说明了）。

PR 提交前自查清单：

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm --filter @inkforge/desktop run verify:all` 通过
- [ ] 涉及 schema/IPC 改动，相关 verify 脚本 / 文档 / changelog 已同步
- [ ] 没有把 API Key、`.env`、`release/` 产物等敏感物 / 大件提进版本库

---

## 贡献类型与对应位置

| 类型 | 位置 | 说明 |
|---|---|---|
| 新 Skill 预设 | `packages/skill-engine/presets/*.json` | 字段参考 [docs/skill-authoring.md](docs/skill-authoring.md) |
| Skill registry 条目 | `inkforge-skills` 仓库（外置） | 通过应用内市场 → 发布向导生成 PR |
| Provider 适配器 | `packages/llm-core/src/<name>-provider.ts` | 实现 `LLMProvider`；在 `apps/desktop/src/main/services/llm-runtime.ts` 加分支；`shared.ProviderVendor` 加枚举 |
| Review 维度 (builtin) | `packages/review-engine/src/index.ts` | 扩 `BUILTIN_DIMENSION_SPECS` + `ReviewBuiltinId` |
| 资料检索 Adapter | `packages/research-core/src/<name>-adapter.ts` | 实现 `ResearchProviderAdapter`；`research-service.adapterFor` 加 case |
| 新 IPC channel | 4 处同改 | `shared/ipc.ts` 加类型 → `shared/preload.ts` 加方法 → `apps/desktop/src/preload/index.ts` 加 invoke → `apps/desktop/src/main/ipc/<name>.ts` 写 handler |
| 翻译 | `packages/shared/src/i18n/*.json` | 三语保持占位符一致；`verify:i18n` 会校验 |

---

## 设计原则（决策时的"北极星"）

1. **心流不可侵犯**：永远不要为"显示 AI 结果"而打断打字。Toast/弹窗用极少的次数
2. **可追溯 > 漂亮**：每条 AI 输出必须能追到 Provider/Model/Skill/Trigger，否则不要写进代码
3. **本地优先**：宁可让用户多一步导入导出，不要为云同步引入账号系统
4. **可拼装 > 大一统**：Skill / Provider / Adapter 都是插件接口，不要把逻辑硬编码进 main 服务

---

## 协议

提交即表示你的代码以 [MIT License](LICENSE) 发布，且你拥有提交它的权利。Skill 预设 / 角色卡 / 示例文本若取自第三方，请保留原协议声明并在 PR 描述里指明来源。

有疑问可在 PR 里 @ 维护者，或开 Discussion 先讨论方向再写代码。
