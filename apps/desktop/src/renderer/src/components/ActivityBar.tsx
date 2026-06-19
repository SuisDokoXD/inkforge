// M9 Phase 1.1+1.2+3.2: ActivityBar with grouped nav + bottom utilities (settings / help / palette).
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
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
import { SPRING_GENTLE, SPRING_SNAPPY } from "../lib/motion-tokens";
import { Divider } from "./ui";

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
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-ink-700 bg-ink-900 py-3"
      role="tablist"
      aria-label={t("nav.aria.label")}
    >
      <LayoutGroup id="activity-main-nav">
        {groupedItems.map((items, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            {idx > 0 && <Divider short />}
            {items.map((item) => {
              const active = mainView === item.view;
              const label = t(item.labelKey);
              const Icon = VIEW_ICONS[item.view];
              return (
                <motion.button
                  key={item.view}
                  type="button"
                  role="tab"
                  aria-current={active ? "page" : undefined}
                  aria-selected={active}
                  aria-label={`${label} (${item.combo})`}
                  whileHover={reduce ? undefined : { scale: 1.04 }}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  transition={SPRING_SNAPPY}
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "text-accent-200"
                      : "text-ink-300 hover:bg-ink-700 hover:text-ink-50"
                  }`}
                  onClick={() => setMainView(item.view)}
                  title={`${label} (${item.combo})`}
                >
                  {active ? (
                    <>
                      <motion.span
                        aria-hidden
                        layoutId={reduce ? undefined : "activity-active-bg"}
                        className="absolute inset-0 rounded-lg bg-accent-500/15 ring-1 ring-accent-500/30"
                        transition={SPRING_GENTLE}
                      />
                      <motion.span
                        aria-hidden
                        layoutId={reduce ? undefined : "activity-active-rail"}
                        className="absolute left-0.5 top-2 h-6 w-0.5 rounded-full bg-accent-300 shadow-[0_0_8px_rgb(var(--accent-300)_/_0.55)]"
                        transition={SPRING_GENTLE}
                      />
                    </>
                  ) : null}
                  <Icon className="relative z-10 h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  <span className="pointer-events-none absolute left-14 z-20 whitespace-nowrap rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {label}
                    <span className="ml-2 text-ink-400">{item.combo}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        ))}
      </LayoutGroup>

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
                <Divider short className="my-1" />
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
      aria-label={`${label} (${combo})`}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      transition={SPRING_SNAPPY}
      className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-50"
      title={`${label} (${combo})`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      <span className="pointer-events-none absolute left-14 z-20 whitespace-nowrap rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover:opacity-100">
        {label}
        <span className="ml-2 text-ink-400">{combo}</span>
      </span>
    </motion.button>
  );
}
