// M9 Phase 3.1: Command palette registry. Each entry is independent of UI; the
// CommandPalette component renders them with cmdk + i18n labels.
import type { MainView } from "../stores/app-store";
import { NAV_SHORTCUTS, ACTION_SHORTCUTS } from "./shortcuts";

export type CommandGroup = "navigate" | "action" | "tool";

export interface Command {
  id: string;
  /** i18n key for label */
  labelKey: string;
  /** Static keywords used to match the user query in addition to the translated label. */
  keywords: string[];
  group: CommandGroup;
  /** Optional accelerator label to show on the right side of the row. */
  shortcut?: string;
  /** Trigger when the user picks this command. */
  run: (ctx: CommandContext) => void;
}

export interface CommandContext {
  setMainView: (view: MainView) => void;
  openSettings: () => void;
  openProviders: () => void;
  toggleTerminal: () => void;
  replayOnboarding: () => void;
  copyDiagnostic: () => Promise<void> | void;
}

/** Build the static command list. Translated labels are resolved by the renderer. */
export function buildCommands(): Command[] {
  const cmds: Command[] = [];

  // Navigate (one entry per main view).
  for (const s of NAV_SHORTCUTS) {
    cmds.push({
      id: `nav:${s.view}`,
      labelKey: s.labelKey,
      keywords: [s.view, s.combo],
      group: "navigate",
      shortcut: s.combo,
      run: (ctx) => ctx.setMainView(s.view),
    });
  }

  // Actions (settings / providers / terminal / palette itself omitted).
  const actionMap: Record<string, (ctx: CommandContext) => void> = {
    "open-settings": (ctx) => ctx.openSettings(),
    "open-providers": (ctx) => ctx.openProviders(),
    "toggle-terminal": (ctx) => ctx.toggleTerminal(),
  };
  for (const s of ACTION_SHORTCUTS) {
    if (!(s.action in actionMap)) continue;
    cmds.push({
      id: `action:${s.action}`,
      labelKey: s.labelKey,
      keywords: [s.action, s.combo],
      group: "action",
      shortcut: s.combo,
      run: actionMap[s.action]!,
    });
  }

  // Tool commands (no shortcut, but discoverable from palette).
  cmds.push({
    id: "tool:replay-onboarding",
    labelKey: "settings.replayOnboarding",
    keywords: ["onboarding", "replay", "tour", "guide"],
    group: "tool",
    run: (ctx) => ctx.replayOnboarding(),
  });
  cmds.push({
    id: "tool:copy-diag",
    labelKey: "error.boundary.copyDiag",
    keywords: ["diagnostic", "diag", "snapshot", "copy"],
    group: "tool",
    run: (ctx) => {
      void ctx.copyDiagnostic();
    },
  });

  return cmds;
}
