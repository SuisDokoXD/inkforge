import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlarmClock, BookOpen, X } from "lucide-react";
import { chapterLogApi } from "../../lib/api";
import {
  DUR,
  EASE_STANDARD,
  fadeOnly,
  hoverLift,
  SPRING_GENTLE,
  SPRING_SNAPPY,
  tapPress,
} from "../../lib/motion-tokens";

const REMINDER_VISIBLE_MS = 10_000;

/**
 * 全局每日提醒 toast。在 App.tsx 顶层挂载。
 * 收到 'chapter-log:daily-reminder' 事件后显示，10 秒后自动消失或用户关闭。
 */
export function ReminderToast(): JSX.Element {
  const [visible, setVisible] = useState(false);
  const [emittedAt, setEmittedAt] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const toastMotion = reduceMotion
    ? fadeOnly
    : {
        initial: { opacity: 0, y: -16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1, transition: SPRING_GENTLE },
        exit: {
          opacity: 0,
          y: -10,
          scale: 0.98,
          transition: { duration: DUR.fast, ease: EASE_STANDARD },
        },
      };
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  useEffect(() => {
    const unsub = chapterLogApi.onReminder((payload) => {
      setEmittedAt(payload.emittedAt);
      setVisible(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), REMINDER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [visible, emittedAt]);

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          variants={toastMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed right-4 top-4 z-50 max-w-sm overflow-hidden rounded-lg border border-accent-500/40 bg-ink-800 text-sm text-ink-100 shadow-2xl"
        >
          <div className="flex items-start gap-2 p-3 pb-3.5">
            <AlarmClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
            <div className="flex-1">
              <div className="font-semibold text-accent-200">每日写作提醒</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-300">
                <BookOpen aria-hidden className="h-3.5 w-3.5 text-ink-400" />
                <span>打开「书房」选一章，记一笔今天的进度或灵感吧。</span>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={() => setVisible(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 hover:bg-ink-700 hover:text-ink-100"
              aria-label="关闭每日写作提醒"
              title="关闭"
              {...buttonMotion}
            >
              <X className="h-3.5 w-3.5" />
            </motion.button>
          </div>
          <motion.div
            key={emittedAt ?? "daily-reminder"}
            aria-hidden
            className="h-0.5 bg-accent-400/70"
            initial={{ width: "100%" }}
            animate={{ width: reduceMotion ? "100%" : "0%" }}
            transition={{ duration: REMINDER_VISIBLE_MS / 1000, ease: "linear" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
