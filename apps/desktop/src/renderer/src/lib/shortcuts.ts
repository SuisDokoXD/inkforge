// M9 · Phase 1.1 · 单一真源：所有"导航类全局快捷键"和它们指向的 MainView。
// ActivityBar 的 tooltip、App.tsx 的 keydown handler、verify-shortcuts.cjs
// 都从这里读取，避免「tooltip 显示但实际未绑定」的虚假承诺。
import type { MainView } from "../stores/app-store";

export interface NavShortcut {
  /** 显示用组合键文案（与 tooltip 一致） */
  combo: string;
  /** 匹配 KeyboardEvent 用的归一键名（小写，特殊键如 backquote） */
  key: string;
  /** 是否需要 Shift */
  shift?: boolean;
  /** 是否需要 Alt */
  alt?: boolean;
  /** 跳转到的视图 */
  view: MainView;
  /** i18n key for ActivityBar label */
  labelKey: string;
  /** 备用图标 emoji（lucide 切换前的 fallback） */
  icon: string;
  /** Visual cluster in ActivityBar. */
  group: "core" | "ai" | "world";
}

/**
 * 与 ActivityBar 共享。顺序即 ActivityBar 的渲染顺序，分组后由 ActivityBar 自行
 * 按 group 字段插入分隔条（暂未启用，留扩展位）。
 */
export const NAV_SHORTCUTS: readonly NavShortcut[] = [
  { combo: "Ctrl+1", key: "1", view: "writing", labelKey: "nav.writing", icon: "✍" , group: "core" },

  { combo: "Ctrl+`", key: "`", view: "outline", labelKey: "nav.outline", icon: "📋" , group: "core" },

  { combo: "Ctrl+2", key: "2", view: "skill", labelKey: "nav.skill", icon: "🧩" , group: "ai" },

  { combo: "Ctrl+3", key: "3", view: "character", labelKey: "nav.character", icon: "👥" , group: "world" },

  { combo: "Ctrl+4", key: "4", view: "tavern", labelKey: "nav.tavern", icon: "🎭" , group: "ai" },

  { combo: "Ctrl+5", key: "5", view: "world", labelKey: "nav.world", icon: "🌍" , group: "world" },

  { combo: "Ctrl+6", key: "6", view: "research", labelKey: "nav.research", icon: "📚" , group: "world" },

  { combo: "Ctrl+7", key: "7", view: "review", labelKey: "nav.review", icon: "📊" , group: "ai" },

  { combo: "Ctrl+8", key: "8", view: "bookshelf", labelKey: "nav.bookshelf", icon: "📖" , group: "core" },

  { combo: "Ctrl+9", key: "9", view: "letters", labelKey: "nav.letters", icon: "📬" , group: "world" },

  { combo: "Ctrl+0", key: "0", view: "achievement", labelKey: "nav.achievement", icon: "🏆" , group: "world" },

  { combo: "Ctrl+Shift+A", key: "a", shift: true, view: "auto-writer", labelKey: "nav.autoWriter", icon: "🤖" , group: "ai" },

  { combo: "Ctrl+M", key: "m", view: "materials", labelKey: "nav.materials", icon: "🗂" , group: "world" },

] as const;

/**
 * 非导航类全局快捷键。WorkspacePage 仍保留 page-scope 的 N（新章节）/ Enter（强制分析），
 * 因为它们需要 chapter 上下文。这里只列 App 全局都该响应的。
 */
export interface ActionShortcut {
  combo: string;
  key: string;
  shift?: boolean;
  alt?: boolean;
  /** 语义动作 id，App.tsx 据此分发 */
  action:
    | "open-settings"
    | "open-providers"
    | "toggle-terminal"
    | "open-command-palette"; // M9 Phase 3 预留
  labelKey: string;
}

export const ACTION_SHORTCUTS: readonly ActionShortcut[] = [
  { combo: "Ctrl+,", key: ",", action: "open-settings", labelKey: "shortcut.settings" },
  { combo: "Ctrl+Shift+,", key: ",", shift: true, action: "open-providers", labelKey: "shortcut.providers" },
  { combo: "Ctrl+J", key: "j", action: "toggle-terminal", labelKey: "shortcut.terminal" },
  { combo: "Ctrl+K", key: "k", action: "open-command-palette", labelKey: "shortcut.commandPalette" },
] as const;

/** 对单个 KeyboardEvent 做匹配。键名归一并忽略大小写。 */
export function matchShortcut(
  e: KeyboardEvent,
  s: { key: string; shift?: boolean; alt?: boolean },
): boolean {
  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod) return false;
  if (!!s.shift !== e.shiftKey) return false;
  if (!!s.alt !== e.altKey) return false;
  // KeyboardEvent.key for backtick is "`"; for digit "1"; for letter lowercase variant.
  return e.key.toLowerCase() === s.key.toLowerCase();
}

/** 判断焦点是否在可编辑控件，避免抢键。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}
