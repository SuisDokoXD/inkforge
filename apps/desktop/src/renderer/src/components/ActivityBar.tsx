// M9 Phase 1.1+1.2+3.2: ActivityBar with grouped nav + bottom utilities (settings / help / palette).
import { motion, useReducedMotion } from "motion/react";
import {
  Feather,
  ListTree,
  Puzzle,
  Users,
  Drama,
  Globe,
  Telescope,
  ClipboardCheck,
  LibraryBig,
  Mail,
  Trophy,
  Bot,
  Archive,
  Command,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { NAV_SHORTCUTS, type NavShortcut } from "../lib/shortcuts";
import { useAppStore } from "../stores/app-store";
import { SPRING_SNAPPY } from "../lib/motion-tokens";

interface ActivityBarProps {
  onOpenPalette: () => void;
}

const GROUP_ORDER: ReadonlyArray<NavShortcut["group"]> = ["core", "ai", "world"];

// 各视图的单色线性图标（lucide）。取代原先的彩色 emoji，与系统蓝/灰阶主题协调。
const VIEW_ICONS: Record<NavShortcut["view"], LucideIcon> = {
  writing: Feather,
  outline: ListTree,
  skill: Puzzle,
  character: Users,
  tavern: Drama,
  world: Globe,
  research: Telescope,
  review: ClipboardCheck,
  bookshelf: LibraryBig,
  letters: Mail,
  achievement: Trophy,
  "auto-writer": Bot,
  materials: Archive,
};

export function ActivityBar({ onOpenPalette }: ActivityBarProps): JSX.Element {
  const t = useT();
  const reduce = useReducedMotion();
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
            const Icon = VIEW_ICONS[item.view];
            return (
              <motion.button
                key={item.view}
                role="tab"
                aria-current={active ? "page" : undefined}
                aria-selected={active}
                whileTap={reduce ? undefined : { scale: 0.9 }}
                transition={SPRING_SNAPPY}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-accent-500/20 text-accent-300 ring-1 ring-accent-500/40"
                    : "text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
                }`}
                onClick={() => setMainView(item.view)}
                title={`${label} (${item.combo})`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                <span className="pointer-events-none absolute left-12 z-20 whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
                  {label}
                  <span className="ml-2 text-ink-400">{item.combo}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <hr aria-hidden className="my-1 h-px w-6 border-0 bg-ink-700/70" />
        <UtilityButton
          Icon={Command}
          label={t("palette.aria.label")}
          combo="Ctrl+K"
          onClick={onOpenPalette}
        />
        <UtilityButton
          Icon={Settings}
          label={t("shortcut.settings")}
          combo="Ctrl+,"
          onClick={() => openSettings(true)}
        />
      </div>
    </nav>
  );
}

function UtilityButton({
  Icon,
  label,
  combo,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  combo: string;
  onClick: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      transition={SPRING_SNAPPY}
      className="group relative flex h-10 w-10 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-700/60 hover:text-ink-100"
      title={`${label} (${combo})`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      <span className="pointer-events-none absolute left-12 z-20 whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
        {label}
        <span className="ml-2 text-ink-400">{combo}</span>
      </span>
    </motion.button>
  );
}
