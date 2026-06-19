// M9 Phase 4.3: TitleBar help menu — discoverable entry to documentation, shortcut sheet,
// onboarding replay, diagnostic snapshot. Lives in TitleBar to be reachable from any view.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionProps, type Variants } from "motion/react";
import { BookOpen, CircleHelp, ClipboardList, Keyboard, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../../lib/i18n";
import { useAppStore } from "../../stores/app-store";
import { externalApi, settingsApi } from "../../lib/api";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import { ShortcutCheatSheet } from "../ShortcutCheatSheet";
import { MotionSpinner } from "../MotionSpinner";

type DiagnosticStatus = { kind: "success" | "error"; text: string };

export function HelpMenu(): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copyingDiag, setCopyingDiag] = useState(false);
  const { status: diagStatus, showStatus: showDiagStatus } = useTimedStatus<DiagnosticStatus>();
  const setSettings = useAppStore((s) => s.setSettings);
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const menuMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleReplayOnboarding = async () => {
    try {
      const next = await settingsApi.set({ updates: { onboardingCompleted: false } });
      setSettings(next);
    } finally {
      setOpen(false);
    }
  };

  const handleCopyDiag = async () => {
    setCopyingDiag(true);
    try {
      const r = await window.inkforge.diag.snapshot({});
      await navigator.clipboard.writeText(r.text);
      showDiagStatus({ kind: "success", text: "诊断信息已复制。" }, 2400);
    } catch {
      showDiagStatus({ kind: "error", text: "无法复制诊断信息，请稍后重试。" });
    } finally {
      setCopyingDiag(false);
      setOpen(false);
    }
  };

  const handleOpenDocs = async () => {
    await externalApi.openUrl({
      url: "https://github.com/tompignofind123-cyber/inkforge#readme",
    });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <motion.button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("help.menu.title")}
        title={t("help.menu.title")}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded text-sm text-ink-300 hover:bg-white/10 hover:text-white"
        {...buttonMotion}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </motion.button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            role="menu"
            className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-md border border-ink-600 bg-ink-800 py-1 text-sm shadow-2xl"
            variants={menuMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.div
              variants={reduceMotion ? undefined : staggerContainer}
              initial={reduceMotion ? undefined : "initial"}
              animate={reduceMotion ? undefined : "animate"}
            >
              <MenuItem
                icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                label={t("help.menu.replayOnboarding")}
                onClick={handleReplayOnboarding}
                buttonMotion={buttonMotion}
                itemMotion={reduceMotion ? fadeOnly : staggerItem}
              />
              <MenuItem
                icon={<Keyboard className="h-3.5 w-3.5" aria-hidden />}
                label={t("help.menu.shortcuts")}
                onClick={() => { setOpen(false); setSheetOpen(true); }}
                buttonMotion={buttonMotion}
                itemMotion={reduceMotion ? fadeOnly : staggerItem}
              />
              <MenuItem
                icon={<BookOpen className="h-3.5 w-3.5" aria-hidden />}
                label={t("help.menu.docs")}
                onClick={handleOpenDocs}
                buttonMotion={buttonMotion}
                itemMotion={reduceMotion ? fadeOnly : staggerItem}
              />
            </motion.div>
            <hr className="my-1 border-ink-700" />
            <MenuItem
              icon={
                copyingDiag
                  ? <MotionSpinner className="h-3.5 w-3.5" />
                  : <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              }
              label={copyingDiag ? "复制中…" : t("help.menu.copyDiag")}
              onClick={handleCopyDiag}
              disabled={copyingDiag}
              buttonMotion={buttonMotion}
              itemMotion={reduceMotion ? fadeOnly : staggerItem}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {diagStatus ? (
          <motion.div
            role={diagStatus.kind === "error" ? "alert" : "status"}
            className={`absolute right-0 top-9 z-50 w-56 rounded-md border px-3 py-2 text-xs shadow-2xl ${
              diagStatus.kind === "error"
                ? "border-rose-500/30 bg-rose-500/15 text-rose-100"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
            }`}
            variants={menuMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {diagStatus.text}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ShortcutCheatSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  buttonMotion,
  itemMotion,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  buttonMotion: MotionProps;
  itemMotion: Variants;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink-200 hover:bg-ink-700 hover:text-ink-50 disabled:cursor-default disabled:opacity-60"
      variants={itemMotion}
      {...(disabled ? {} : buttonMotion)}
    >
      <span className="inline-flex w-4 items-center justify-center text-ink-400">
        {icon}
      </span>
      {label}
    </motion.button>
  );
}
