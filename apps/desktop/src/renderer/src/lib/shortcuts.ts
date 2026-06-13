import type { MainView } from "../stores/app-store";

export interface NavShortcut {
  combo: string;
  key: string;
  shift?: boolean;
  alt?: boolean;
  view: MainView;
  labelKey: string;
  icon: string;
  group: "core" | "ai" | "world";
}

// The order here is the visual order inside ActivityBar after grouping:
// core, ai, world. Keep the first ten entries as Ctrl+1 ... Ctrl+0 so the
// shortcuts read naturally from top to bottom.
export const NAV_SHORTCUTS: readonly NavShortcut[] = [
  { combo: "Ctrl+1", key: "1", view: "writing", labelKey: "nav.writing", icon: "W", group: "core" },
  { combo: "Ctrl+2", key: "2", view: "outline", labelKey: "nav.outline", icon: "O", group: "core" },
  { combo: "Ctrl+3", key: "3", view: "bookshelf", labelKey: "nav.bookshelf", icon: "B", group: "core" },

  { combo: "Ctrl+4", key: "4", view: "skill", labelKey: "nav.skill", icon: "S", group: "ai" },
  { combo: "Ctrl+5", key: "5", view: "tavern", labelKey: "nav.tavern", icon: "T", group: "ai" },
  { combo: "Ctrl+6", key: "6", view: "review", labelKey: "nav.review", icon: "R", group: "ai" },
  { combo: "Ctrl+7", key: "7", view: "auto-writer", labelKey: "nav.autoWriter", icon: "A", group: "ai" },

  { combo: "Ctrl+8", key: "8", view: "character", labelKey: "nav.character", icon: "C", group: "world" },
  { combo: "Ctrl+9", key: "9", view: "world", labelKey: "nav.world", icon: "W", group: "world" },
  { combo: "Ctrl+0", key: "0", view: "research", labelKey: "nav.research", icon: "R", group: "world" },
  { combo: "Ctrl+Shift+L", key: "l", shift: true, view: "letters", labelKey: "nav.letters", icon: "L", group: "world" },
  { combo: "Ctrl+Shift+H", key: "h", shift: true, view: "achievement", labelKey: "nav.achievement", icon: "H", group: "world" },
  { combo: "Ctrl+Shift+M", key: "m", shift: true, view: "materials", labelKey: "nav.materials", icon: "M", group: "world" },
] as const;

export interface ActionShortcut {
  combo: string;
  key: string;
  shift?: boolean;
  alt?: boolean;
  action:
    | "open-settings"
    | "open-providers"
    | "toggle-terminal"
    | "open-command-palette";
  labelKey: string;
}

export const ACTION_SHORTCUTS: readonly ActionShortcut[] = [
  { combo: "Ctrl+,", key: ",", action: "open-settings", labelKey: "shortcut.settings" },
  { combo: "Ctrl+Shift+,", key: ",", shift: true, action: "open-providers", labelKey: "shortcut.providers" },
  { combo: "Ctrl+J", key: "j", action: "toggle-terminal", labelKey: "shortcut.terminal" },
  { combo: "Ctrl+K", key: "k", action: "open-command-palette", labelKey: "shortcut.commandPalette" },
] as const;

export interface ActionShortcutOptions {
  terminalEnabled?: boolean;
}

export function getActionShortcuts(
  options: ActionShortcutOptions = {},
): readonly ActionShortcut[] {
  const terminalEnabled = options.terminalEnabled ?? true;
  return ACTION_SHORTCUTS.filter(
    (shortcut) => terminalEnabled || shortcut.action !== "toggle-terminal",
  );
}

export function matchShortcut(
  e: KeyboardEvent,
  s: { key: string; shift?: boolean; alt?: boolean },
): boolean {
  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod) return false;
  if (!!s.shift !== e.shiftKey) return false;
  if (!!s.alt !== e.altKey) return false;
  return e.key.toLowerCase() === s.key.toLowerCase();
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}
