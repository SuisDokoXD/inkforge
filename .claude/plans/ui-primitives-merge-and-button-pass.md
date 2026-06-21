# InkForge UI Primitives 收口执行计划

## 目标

把 `feat/ui-primitives` 上已经完成的 UI primitive 统一工作验收、修正、合并回 `main`，然后继续做一小批高频页面按钮统一。优先保证写作软件的可靠性和界面一致性，不再继续玻璃效果或主观视觉实验。

## 执行顺序

1. 当前分支验收
   - 确认 `feat/ui-primitives` 与远端同步。
   - 保留未跟踪 `.visual-audit/`，不提交。
   - 跑 `git diff --check`、`pnpm typecheck`、`pnpm -C apps/desktop exec electron-vite build`。
   - 启动 Electron dev app，做桌面截图/肉眼检查，重点看 Badge/Button primitive 是否拥挤、错位、突兀。

2. 明显问题修复
   - 只修验收中能明确判断的问题：对齐、尺寸、文本溢出、太小/太挤、明显误用 primitive。
   - 不碰玻璃、设置、存储、业务逻辑、世界图谱内部控件、特殊卡片/动效。
   - 修复后再次跑 typecheck/build/a11y/diff check，并小提交。

3. 合并主线
   - 验证通过后切到 `main`。
   - 快进或普通合并 `feat/ui-primitives`，不使用 destructive git 命令。
   - 合并后跑 `pnpm typecheck` 和 desktop build。
   - 推送 `main`。

4. 下一批按钮 primitive
   - 在 `main` 上开/继续一个小批次，只迁移高频页面中低风险的纯按钮：
     `MaterialsPage`、`ResearchPage`、`SkillPage`、`WorldPage`、`AutoWriterPanel`、`ProviderSettingsPanel`。
   - 只把等价按钮换成现有 `Button` / `IconButton`，保留 onClick、disabled、title、aria、文案和布局意图。
   - 跳过筛选 chip、分段控件、删除确认、图谱控件、标题栏、特殊视觉卡片、toast/update/companion 动效。
   - 每批不超过 3-5 个文件，验证后提交推送。

## 验证门禁

- `git diff --check`
- 目标文件静态无障碍扫描
- `pnpm typecheck`
- `pnpm -C apps/desktop exec electron-vite build`
- 需要时 Electron dev app 截图/肉眼检查

## 禁止事项

- 不碰玻璃质感。
- 不改设置、存储、IPC、数据库、正文编辑数据流。
- 不用 `git add -A`。
- 不提交 `.visual-audit/`。
- 不机械替换交互 chip/特殊控件。
