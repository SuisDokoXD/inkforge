import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MotionProps, Variants } from "motion/react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { diagApi } from "../lib/api";
import { useT } from "../lib/i18n";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";

type VisibleCrashState = {
  kind: "visible";
  at: number | null;
  reason: string | null;
  expanded: boolean;
};

type ButtonMotionProps = Pick<MotionProps, "whileHover" | "whileTap" | "transition">;

/**
 * Shown once per session when the previous run did not exit cleanly.
 * Dismissal clears the in-memory flag; the live lock file is only removed on
 * clean quit, so the signal is retained for diagnostics until then.
 */
export function CrashRecoveryBanner(): JSX.Element | null {
  const reduceMotion = useReducedMotion() === true;
  const bannerMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion: ButtonMotionProps = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "hidden" }
    | VisibleCrashState
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    diagApi
      .crashStatus()
      .then((res) => {
        if (!active) return;
        setState(
          res.crashed
            ? { kind: "visible", at: res.crashedAt, reason: res.reason, expanded: false }
            : { kind: "hidden" },
        );
      })
      .catch(() => active && setState({ kind: "hidden" }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <AnimatePresence initial={false}>
      {state.kind === "visible" ? (
        <RecoveryBannerBody
          key="crash-recovery"
          state={state}
          bannerMotion={bannerMotion}
          buttonMotion={buttonMotion}
          onToggleDetails={() =>
            setState((s) => (s.kind === "visible" ? { ...s, expanded: !s.expanded } : s))
          }
          onDismiss={() => {
            void diagApi.crashDismiss();
            setState({ kind: "hidden" });
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}

interface RecoveryBannerBodyProps {
  state: VisibleCrashState;
  bannerMotion: Variants;
  buttonMotion: ButtonMotionProps;
  onToggleDetails(): void;
  onDismiss(): void;
}

function RecoveryBannerBody({
  state,
  bannerMotion,
  buttonMotion,
  onToggleDetails,
  onDismiss,
}: RecoveryBannerBodyProps): JSX.Element {
  const t = useT();
  const when = state.at ? new Date(state.at).toLocaleString() : null;
  const detailsId = "crash-recovery-details";

  return (
    <motion.div
      role="alert"
      className="border-b border-accent-500/40 bg-accent-500/10 px-4 py-2 text-sm text-accent-100"
      variants={bannerMotion}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold">{t("crashBanner.title")}</span>
            {when ? (
              <span className="text-xs text-accent-200/60">{when}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-accent-200/80">{t("crashBanner.body")}</p>
        </div>
        {state.reason ? (
          <motion.button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-accent-400/40 px-2 py-0.5 text-xs hover:bg-accent-500/20"
            onClick={onToggleDetails}
            aria-expanded={state.expanded}
            aria-controls={detailsId}
            {...buttonMotion}
          >
            <motion.span
              aria-hidden
              animate={{ rotate: state.expanded ? 180 : 0 }}
              transition={SPRING_SNAPPY}
              className="inline-flex"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
            {state.expanded ? t("crashBanner.hideDetails") : t("crashBanner.showDetails")}
          </motion.button>
        ) : null}
        <motion.button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-accent-400/40 text-accent-100/80 hover:bg-accent-500/20 hover:text-accent-50"
          onClick={onDismiss}
          aria-label={t("crashBanner.dismiss")}
          title={t("crashBanner.dismiss")}
          {...buttonMotion}
        >
          <X className="h-3.5 w-3.5" />
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {state.expanded && state.reason ? (
          <motion.pre
            id={detailsId}
            key="crash-details"
            className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-accent-100/80"
            variants={bannerMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {state.reason}
          </motion.pre>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
