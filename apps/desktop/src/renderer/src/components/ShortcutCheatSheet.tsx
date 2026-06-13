// M9 Phase 4.3: Auto-rendered cheat sheet from lib/shortcuts.ts so it can never lie.
import { useT } from "../lib/i18n";
import { useAppStore } from "../stores/app-store";
import { NAV_SHORTCUTS, getActionShortcuts } from "../lib/shortcuts";
import { AnimatedDialog } from "./AnimatedDialog";

export interface ShortcutCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutCheatSheet({ open, onClose }: ShortcutCheatSheetProps): JSX.Element {
  const t = useT();
  const terminalEnabled = useAppStore((s) => s.settings.devModeEnabled);
  const actionShortcuts = getActionShortcuts({ terminalEnabled });
  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel={t("help.shortcuts.title")}
      overlayClassName="flex items-start justify-center p-4 pt-[10vh]"
      zClassName="z-[55]"
      panelClassName="w-full max-w-lg overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-100">{t("help.shortcuts.title")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-sm text-ink-400 hover:bg-ink-700 hover:text-ink-200"
          aria-label={t("common.close")}
        >
          ✕
        </button>
      </header>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <Section title={t("help.shortcuts.navigation")}>
          {NAV_SHORTCUTS.map((s) => (
            <Row key={s.view} combo={s.combo} label={t(s.labelKey)} />
          ))}
        </Section>
        <Section title={t("help.shortcuts.actions")}>
          {actionShortcuts.map((s) => (
            <Row key={s.action} combo={s.combo} label={t(s.labelKey)} />
          ))}
          <Row combo="Ctrl+N" label={t("help.shortcuts.newChapter")} />
          <Row combo="Ctrl+Enter" label={t("help.shortcuts.forceAnalyze")} />
        </Section>
      </div>
    </AnimatedDialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function Row({ combo, label }: { combo: string; label: string }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 rounded px-2 py-1 text-ink-200 hover:bg-ink-700/40">
      <span>{label}</span>
      <kbd className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-ink-300">
        {combo}
      </kbd>
    </li>
  );
}
