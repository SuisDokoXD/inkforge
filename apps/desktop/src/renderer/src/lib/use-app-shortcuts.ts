// M9 · Phase 1.1 · 拆分快捷键 hook：
//   useGlobalShortcuts —— 由 App.tsx 注册，覆盖所有 NAV_SHORTCUTS + ACTION_SHORTCUTS。
//                         任何视图下都生效，修复「Ctrl+1~9 在非 WorkspacePage 时失效」。
//   useChapterShortcuts —— 由 WorkspacePage 注册，处理需 chapter 上下文的 N / Ctrl+Enter。
import { useEffect } from "react";
import type { MainView } from "../stores/app-store";
import {
  NAV_SHORTCUTS,
  ACTION_SHORTCUTS,
  matchShortcut,
  isEditableTarget,
} from "./shortcuts";

export interface GlobalShortcutHandlers {
  onSwitchMainView: (view: MainView) => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  onToggleTerminal: () => void;
  onOpenCommandPalette?: () => void;
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;

      // 导航类：13 个一级视图
      for (const s of NAV_SHORTCUTS) {
        if (!matchShortcut(e, s)) continue;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        handlers.onSwitchMainView(s.view);
        return;
      }

      // 动作类：设置 / Provider / 终端 / 命令面板
      for (const s of ACTION_SHORTCUTS) {
        if (!matchShortcut(e, s)) continue;
        // 设置/Provider/命令面板 不忽略可编辑焦点（用户期望随时可开）
        e.preventDefault();
        switch (s.action) {
          case "open-settings":
            handlers.onOpenSettings();
            return;
          case "open-providers":
            handlers.onOpenProviders();
            return;
          case "toggle-terminal":
            if (isEditableTarget(e.target)) return;
            handlers.onToggleTerminal();
            return;
          case "open-command-palette":
            handlers.onOpenCommandPalette?.();
            return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}

export interface ChapterShortcutHandlers {
  onNewChapter?: () => void;
  onForceAnalyze?: () => void;
}

export function useChapterShortcuts(handlers: ChapterShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        handlers.onNewChapter?.();
        return;
      }
      if (k === "enter") {
        e.preventDefault();
        handlers.onForceAnalyze?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}

// ----- 兼容旧接口（WorkspagePage 已有 useAppShortcuts 调用，平稳迁移） -----
export interface ShortcutHandlers extends GlobalShortcutHandlers, ChapterShortcutHandlers {}

/**
 * @deprecated 使用 useGlobalShortcuts（App.tsx）+ useChapterShortcuts（WorkspacePage）替代。
 * 暂时保留以避免破坏旧调用点。下一个 minor 删除。
 */
export function useAppShortcuts(handlers: Partial<ShortcutHandlers>): void {
  useChapterShortcuts({
    onNewChapter: handlers.onNewChapter,
    onForceAnalyze: handlers.onForceAnalyze,
  });
}
