// M9 Phase 3.1: Command palette registry. Each entry is independent of UI; the
// CommandPalette component renders them with cmdk + i18n labels.
import type { MainView } from "../stores/app-store";
import { NAV_SHORTCUTS, getActionShortcuts } from "./shortcuts";

export type CommandGroup = "navigate" | "action" | "tool" | "project" | "writer";

export interface Command {
  id: string;
  labelKey: string;
  keywords: string[];
  group: CommandGroup;
  shortcut?: string;
  run: (ctx: CommandContext) => void;
  /** 仅在项目活跃时可用（如创建章节、运行分析等） */
  requiresProject?: boolean;
}

// A4: 扩展命令上下文，支持项目级和写作级操作。
export interface CommandContext {
  setMainView: (view: MainView) => void;
  openSettings: () => void;
  openProviders: () => void;
  toggleTerminal: () => void;
  replayOnboarding: () => void;
  copyDiagnostic: () => Promise<void> | void;
  // 项目级操作
  hasProject: boolean;
  createChapter?: () => void;
  openExport?: () => void;
  // 写作级操作（仅在 writing 视图 + 有章节时有效）
  isWriting: boolean;
  toggleFocusMode?: () => void;
  toggleTypewriterMode?: () => void;
  runManualAnalyze?: () => void;
  toggleRightPanel?: () => void;
  setEditorWidth?: (width: "narrow" | "medium" | "wide") => void;
  adjustFontSize?: (delta: number) => void;
}

export interface CommandBuildOptions {
  terminalEnabled?: boolean;
}

// A4: 简化的命令工厂——减少样板代码。
function cmd(
  id: string,
  labelKey: string,
  keywords: string[],
  group: CommandGroup,
  run: (ctx: CommandContext) => void,
  opts?: { shortcut?: string; requiresProject?: boolean },
): Command {
  return { id, labelKey, keywords, group, run, ...opts };
}

/** Build the static command list. Translated labels are resolved by the renderer. */
export function buildCommands(options: CommandBuildOptions = {}): Command[] {
  const cmds: Command[] = [];

  // ── Navigate (one entry per main view) ──
  for (const s of NAV_SHORTCUTS) {
    cmds.push(cmd(`nav:${s.view}`, s.labelKey, [s.view, s.combo], "navigate", (ctx) => ctx.setMainView(s.view), { shortcut: s.combo }));
  }

  // ── Actions (settings / providers / terminal) ──
  cmds.push(cmd("action:open-settings", "shortcut.settings", ["settings", "preferences", "config", "Ctrl+,"], "action", (ctx) => ctx.openSettings(), { shortcut: "Ctrl+," }));
  cmds.push(cmd("action:open-providers", "shortcut.providers", ["providers", "llm", "model", "api"], "action", (ctx) => ctx.openProviders(), { shortcut: "Ctrl+Shift+," }));
  if (options.terminalEnabled ?? true) {
    cmds.push(cmd("action:toggle-terminal", "shortcut.terminal", ["terminal", "shell", "dev"], "action", (ctx) => ctx.toggleTerminal(), { shortcut: "Ctrl+J" }));
  }

  // ── Project (仅项目活跃时可用) ──
  cmds.push(cmd("project:create-chapter", "cmd.createChapter", ["new", "chapter", "create"], "project", (ctx) => ctx.createChapter?.(), { requiresProject: true }));
  cmds.push(cmd("project:review-chapter", "cmd.reviewChapter", ["review", "analyze", "check"], "project", (ctx) => { ctx.setMainView("review"); }, { requiresProject: true }));
  cmds.push(cmd("project:auto-write", "cmd.autoWrite", ["generate", "auto", "write"], "project", (ctx) => { ctx.setMainView("auto-writer"); }, { requiresProject: true }));
  cmds.push(cmd("project:open-export", "cmd.export", ["export", "download", "save"], "project", (ctx) => ctx.openExport?.(), { requiresProject: true }));

  // ── Writer (写作视图 + 有章节) ──
  cmds.push(cmd("writer:toggle-focus", "cmd.toggleFocusMode", ["focus", "distraction", "fullscreen", "F11"], "writer", (ctx) => ctx.toggleFocusMode?.(), { shortcut: "F11", requiresProject: true }));
  cmds.push(cmd("writer:toggle-typewriter", "cmd.toggleTypewriterMode", ["typewriter", "scroll", "center"], "writer", (ctx) => ctx.toggleTypewriterMode?.(), { requiresProject: true }));
  cmds.push(cmd("writer:analyze", "cmd.runAnalysis", ["analyze", "review", "feedback"], "writer", (ctx) => ctx.runManualAnalyze?.(), { requiresProject: true }));
  cmds.push(cmd("writer:toggle-right-panel", "cmd.toggleRightPanel", ["panel", "sidebar", "timeline", "chat"], "writer", (ctx) => ctx.toggleRightPanel?.(), { requiresProject: true }));
  cmds.push(cmd("writer:editor-narrow", "cmd.editorWidthNarrow", ["narrow", "width", "layout"], "writer", (ctx) => ctx.setEditorWidth?.("narrow"), { requiresProject: true }));
  cmds.push(cmd("writer:editor-medium", "cmd.editorWidthMedium", ["medium", "width", "layout"], "writer", (ctx) => ctx.setEditorWidth?.("medium"), { requiresProject: true }));
  cmds.push(cmd("writer:editor-wide", "cmd.editorWidthWide", ["wide", "width", "layout"], "writer", (ctx) => ctx.setEditorWidth?.("wide"), { requiresProject: true }));
  cmds.push(cmd("writer:font-larger", "cmd.fontLarger", ["font", "bigger", "increase", "zoom"], "writer", (ctx) => ctx.adjustFontSize?.(1), { requiresProject: true }));
  cmds.push(cmd("writer:font-smaller", "cmd.fontSmaller", ["font", "smaller", "decrease", "zoom"], "writer", (ctx) => ctx.adjustFontSize?.(-1), { requiresProject: true }));

  // ── Tool ──
  cmds.push(cmd("tool:replay-onboarding", "settings.replayOnboarding", ["onboarding", "replay", "tour", "guide"], "tool", (ctx) => ctx.replayOnboarding()));
  cmds.push(cmd("tool:copy-diag", "error.boundary.copyDiag", ["diagnostic", "diag", "snapshot", "copy"], "tool", (ctx) => { void ctx.copyDiagnostic(); }));

  return cmds;
}
