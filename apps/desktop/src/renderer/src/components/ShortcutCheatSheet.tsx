// M9 Phase 4.3: Auto-rendered cheat sheet from lib/shortcuts.ts so it can never lie.
import { X } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n";
import { useAppStore } from "../stores/app-store";
import { NAV_SHORTCUTS, getActionShortcuts } from "../lib/shortcuts";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../lib/motion-tokens";
import { AnimatedDialog } from "./AnimatedDialog";

export interface ShortcutCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutCheatSheet({ open, onClose }: ShortcutCheatSheetProps): JSX.Element {
  const t = useT();
  const terminalEnabled = useAppStore((s) => s.settings.devModeEnabled);
  const actionShortcuts = getActionShortcuts({ terminalEnabled });
  const reduceMotion = useReducedMotion() === true;
  const rowMotion = reduceMotion ? fadeOnly : staggerItem;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

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
        <motion.button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-700 hover:text-ink-200"
          aria-label={t("common.close")}
          title={t("common.close")}
          {...buttonMotion}
        >
          <X className="h-4 w-4" />
        </motion.button>
      </header>
      <motion.div
        className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4 text-sm"
        variants={reduceMotion ? undefined : staggerContainer}
        initial={reduceMotion ? undefined : "initial"}
        animate={reduceMotion ? undefined : "animate"}
      >
        <Section title={t("help.shortcuts.navigation")} variants={rowMotion}>
          {NAV_SHORTCUTS.map((s) => (
            <Row key={s.view} combo={s.combo} label={t(s.labelKey)} variants={rowMotion} />
          ))}
        </Section>
        <Section title={t("help.shortcuts.actions")} variants={rowMotion}>
          {actionShortcuts.map((s) => (
            <Row key={s.action} combo={s.combo} label={t(s.labelKey)} variants={rowMotion} />
          ))}
          <Row combo="Ctrl+N" label={t("help.shortcuts.newChapter")} variants={rowMotion} />
          <Row combo="Ctrl+Enter" label={t("help.shortcuts.forceAnalyze")} variants={rowMotion} />
        </Section>
      </motion.div>
    </AnimatedDialog>
  );
}

function Section({
  title,
  children,
  variants,
}: {
  title: string;
  children: ReactNode;
  variants: Variants;
}): JSX.Element {
  return (
    <motion.section variants={variants}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{title}</h3>
      <motion.ul
        className="space-y-1"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {children}
      </motion.ul>
    </motion.section>
  );
}

function Row({
  combo,
  label,
  variants,
}: {
  combo: string;
  label: string;
  variants: Variants;
}): JSX.Element {
  return (
    <motion.li
      className="flex items-center justify-between gap-4 rounded px-2 py-1 text-ink-200 hover:bg-ink-700/40"
      variants={variants}
    >
      <span>{label}</span>
      <kbd className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-ink-300">
        {combo}
      </kbd>
    </motion.li>
  );
}
