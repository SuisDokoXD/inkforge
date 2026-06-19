// M9 Phase 4.2: shared empty-state placeholder. Use across pages for consistent guidance.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../lib/motion-tokens";

export interface EmptyStateProps {
  /** Large decorative icon shown above the empty-state title. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary CTA. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Secondary CTA, e.g. "Read docs". */
  secondary?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action, secondary }: EmptyStateProps): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const itemMotion = reduceMotion ? fadeOnly : staggerItem;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 text-center"
      variants={reduceMotion ? fadeOnly : staggerContainer}
      initial="initial"
      animate="animate"
    >
      <motion.div className="text-5xl opacity-60" aria-hidden variants={itemMotion}>
        {icon ?? <Sparkles className="h-10 w-10" />}
      </motion.div>
      <motion.h2 className="mt-4 text-base font-semibold text-ink-100" variants={itemMotion}>
        {title}
      </motion.h2>
      {description ? (
        <motion.p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400" variants={itemMotion}>
          {description}
        </motion.p>
      ) : null}
      {(action || secondary) && (
        <motion.div className="mt-5 flex flex-wrap items-center justify-center gap-3" variants={itemMotion}>
          {action ? (
            <motion.button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
              {...buttonMotion}
            >
              {action.label}
            </motion.button>
          ) : null}
          {secondary ? (
            <motion.button
              type="button"
              onClick={secondary.onClick}
              className="rounded-md border border-ink-600 bg-ink-900 px-4 py-1.5 text-sm text-ink-200 hover:bg-ink-700"
              {...buttonMotion}
            >
              {secondary.label}
            </motion.button>
          ) : null}
        </motion.div>
      )}
    </motion.div>
  );
}
