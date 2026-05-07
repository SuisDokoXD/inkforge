# M9 · 体验打磨与社区生态

> 跟踪文档：`apps/desktop` 的 M9 阶段性进度。详细方案见根目录 `.claude/plans/refactored-gathering-sonnet.md`（开发期工作笔记）。

## 进度速览

| Phase | 主题 | 状态 |
|---|---|---|
| 0 | 立项与基线 | ✅ |
| 1 | 修复虚假承诺与基础正确性 | ✅ |
| 2.1 | 路由级代码分割 | ✅ |
| 2.2 | 列表虚拟化 | ✅ |
| 2.3 | 状态选择器与渲染优化 | 🚧 |
| 2.4 | 编辑器层 | 🚧 |
| 2.5 | 主进程启动优化 | ✅ |
| 2.6 | 包体瘦身 | 🚧 |
| 3.1 | 全局命令面板 | ✅ |
| 3.2 | ActivityBar 分组 | ✅ |
| 3.3 | 图标体系（emoji → SVG） | 🚧 |
| 4.1 | 渐进式 CoachMark | 🚧 |
| 4.2 | 空状态升级 | ✅ (EmptyState 共享) |
| 4.3 | 引导可重玩 + 帮助菜单 | ✅ |
| 5.x | 反馈 / a11y / 个性化 | ✅ (Esc/aria-modal/HelpMenu) |
| 6 | 可观测性与诊断 | ✅ (内嵌诊断面板) |

## 关键改动

### Phase 1 修复
- `lib/shortcuts.ts`：13 个一级视图 + 4 个动作快捷键的单一真源；`useGlobalShortcuts` 在 App 层注册，跨视图全部生效
- `verify-shortcuts.cjs`：静态校验「ActivityBar tooltip ⊆ 已绑定」，回归保险
- 22 个 i18n 键补全 zh/en/ja
- SettingsDialog 增「重新观看新手引导」按钮 + App 监听 `onboardingCompleted` 重入

### Phase 2 性能
- 路由：12 非首屏页面改 `React.lazy + Suspense`，统一 `PageSkeleton` fallback
- 虚拟化（`@tanstack/react-virtual`）：AITimeline / LetterInbox / ChapterTree
- 主进程：`vacuum scheduler / skill triggers / preset seeding` 推迟到 `setImmediate`，BrowserWindow 先显示

### Phase 3 信息架构
- 命令面板（`cmdk`）：`Ctrl+K`，覆盖跳转 / 动作 / 工具三组
- ActivityBar 三组分隔：核心 / AI 协作 / 世界陪伴；底部固定「⌘K + 设置」工具栏

### Phase 4 引导
- `components/EmptyState.tsx`：可复用空状态（icon/title/desc + 主+次 CTA）
- `components/ShortcutCheatSheet.tsx`：从 `lib/shortcuts.ts` 自动生成的快捷键速查弹窗
- `components/titlebar/HelpMenu.tsx`：TitleBar 增「?」入口 → 重玩引导 / 快捷键 / 文档 / 复制诊断

### Phase 6 诊断
- SettingsDialog 增「性能与诊断」面板：内嵌渲染 `diag.snapshot` 输出（启动耗时 / DB 大小 / CPU / 近期错误），保留旁挂的「复制」按钮

### Phase 5 反馈与可访问性
- SettingsDialog：Esc 关闭、`aria-modal` + `aria-label`、点击背景关闭、内容区阻止冒泡
- 仍未做：`ToastHost` 抽离（AchievementToast/ReminderToast 各自维持现状）、字号缩放、主题跟随系统、编辑器宽度（需扩 `AppSettings` 与 storage repo，留给 v0.2.x patch）

## 基线数据

跑 `pnpm --filter @inkforge/desktop run bench:startup` 取本机基线（开发机环境差异大，仅作回归对照）。
