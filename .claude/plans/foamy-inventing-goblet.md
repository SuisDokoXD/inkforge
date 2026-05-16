# 全面优化写作体验

## Context

用户希望编辑器的写作体验对标国内主流写作软件（码字猫、壹写作、妙笔等）。当前编辑器功能较为基础，缺少写作软件常见的体验优化。

## 优化项目

### 1. 首行自动缩进两格
每次按回车新建段落时，自动插入两个全角空格（\u3000\u3000）作为首行缩进。这是中文写作的标准格式。

### 2. 打字机模式（Typewriter Mode）
光标所在行始终保持在编辑区域垂直居中位置，减少视线移动。通过 CSS `scroll-padding` + `scrollIntoView` 实现。

### 3. 专注模式（Focus Mode）
隐藏左右侧边栏和工具栏，编辑器全屏沉浸写作。按 Esc 或快捷键退出。

### 4. 编辑器外观设置
在设置面板中添加：
- 字体大小（14-24px，默认 16px）
- 行高（1.5-3.0，默认 2.0）
- 编辑区宽度（窄/中/宽）

### 5. 工具栏精简
写作时工具栏自动收起/半透明，鼠标悬停时显示。减少视觉干扰。

### 6. 段落间距优化
段落间距从 1em 改为 0.5em，更贴近实际书籍排版。

### 7. 选中文本高亮优化
使用更柔和的选中色，减少视觉跳跃。

## 实施计划

### Step 1: 扩展 AppSettings 类型
**文件**: `packages/shared/src/domain.ts`
- 添加 `editorFontSize`, `editorLineHeight`, `editorWidth`, `typewriterMode`, `autoIndent` 字段

### Step 2: 首行自动缩进
**文件**: `packages/editor/src/components/novel-editor.tsx`
- 在 `editorProps` 中添加 `handleKeyDown`，监听 Enter 键
- 新段落自动插入 `\u3000\u3000`

### Step 3: 打字机模式
**文件**: `packages/editor/src/components/novel-editor.tsx`
- 添加 `typewriterMode` prop
- 在 `onUpdate` 中，如果启用则 `scrollIntoView` 让光标行居中

### Step 4: 专注模式
**文件**: `apps/desktop/src/renderer/src/components/EditorPane.tsx`
- 添加专注模式状态和切换按钮（F11 或 Ctrl+Shift+F）
- 专注模式下隐藏工具栏，编辑器占满全屏

**文件**: `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx`
- 专注模式下隐藏左右侧边栏

### Step 5: 编辑器外观设置 UI
**文件**: `apps/desktop/src/renderer/src/components/SettingsDialog.tsx`
- 添加"编辑器"设置区域：字体大小滑块、行高滑块、宽度选择、打字机模式开关、自动缩进开关

### Step 6: 样式优化
**文件**: `apps/desktop/src/renderer/src/styles.css`
- 优化段落间距、选中高亮色
- 添加打字机模式的 scroll-padding CSS

**文件**: `apps/desktop/src/renderer/src/components/EditorPane.tsx`
- 工具栏自动淡出效果
- 根据设置动态应用字体大小、行高、宽度

## 关键文件

- `packages/shared/src/domain.ts` — AppSettings 类型
- `packages/editor/src/components/novel-editor.tsx` — 编辑器核心
- `apps/desktop/src/renderer/src/components/EditorPane.tsx` — 编辑器面板
- `apps/desktop/src/renderer/src/components/SettingsDialog.tsx` — 设置对话框
- `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx` — 页面布局
- `apps/desktop/src/renderer/src/styles.css` — 全局样式
- `apps/desktop/src/renderer/src/stores/app-store.ts` — 状态管理

## 验证

1. 新建段落自动出现两格缩进
2. 打字机模式下光标行保持居中
3. F11 进入专注模式，Esc 退出
4. 设置中调整字体大小/行高实时生效
5. 工具栏在写作时自动淡出
