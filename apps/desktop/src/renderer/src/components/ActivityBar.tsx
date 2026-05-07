// M9 Phase 1.1+1.2+3.2: ActivityBar with grouped nav + bottom utilities (settings / help / palette).
import { useT } from "../lib/i18n";
import { NAV_SHORTCUTS, type NavShortcut } from "../lib/shortcuts";
import { useAppStore } from "../stores/app-store";

interface ActivityBarProps {
  onOpenPalette: () => void;
}

const GROUP_ORDER: ReadonlyArray<NavShortcut["group"]> = ["core", "ai", "world"];

export function ActivityBar({ onOpenPalette }: ActivityBarProps): JSX.Element {
  const t = useT();
  const mainView = useAppStore((s) => s.mainView);
  const setMainView = useAppStore((s) => s.setMainView);
  const openSettings = useAppStore((s) => s.openSettings);

  const groupedItems: NavShortcut[][] = GROUP_ORDER.map((g) =>
    NAV_SHORTCUTS.filter((s) => s.group === g),
  );

  return (
    <nav
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-ink-700 bg-ink-900/90 py-2"
      role="tablist"
      aria-label={t("nav.aria.label")}
    >
      {groupedItems.map((items, idx) => (
        <div key={idx} className="flex flex-col items-center gap-1">
          {idx > 0 && <hr aria-hidden className="my-1 h-px w-6 border-0 bg-ink-700/70" />}
          {items.map((item) => {
            const active = mainView === item.view;
            const label = t(item.labelKey);
            return (
              <button
                key={item.view}
                role="tab"
                aria-current={active ? "page" : undefined}
                aria-selected={active}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-md text-lg transition-colors ${
                  active
                    ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
                }`}
                onClick={() => setMainView(item.view)}
                title={`${label} (${item.combo})`}
              >
                <span aria-hidden>{item.icon}</span>
                <span className="pointer-events-none absolute left-12 z-20 whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
                  {label}
                  <span className="ml-2 text-ink-400">{item.combo}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <hr aria-hidden className="my-1 h-px w-6 border-0 bg-ink-700/70" />
        <UtilityButton
          icon="⌘K"
          label={t("palette.aria.label")}
          combo="Ctrl+K"
          onClick={onOpenPalette}
        />
        <UtilityButton
          icon="⚙"
          label={t("shortcut.settings")}
          combo="Ctrl+,"
          onClick={() => openSettings(true)}
        />
      </div>
    </nav>
  );
}

function UtilityButton({
  icon,
  label,
  combo,
  onClick,
}: {
  icon: string;
  label: string;
  combo: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-10 w-10 items-center justify-center rounded-md text-base text-ink-300 transition-colors hover:bg-ink-700/60 hover:text-ink-100"
      title={`${label} (${combo})`}
    >
      <span aria-hidden>{icon}</span>
      <span className="pointer-events-none absolute left-12 z-20 whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
        {label}
        <span className="ml-2 text-ink-400">{combo}</span>
      </span>
    </button>
  );
}
