import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen } from "lucide-react";
import { projectApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";

interface NewBookDialogProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功后回调，传 projectId（用于自动打开 Tab）。 */
  onCreated?: (projectId: string) => void;
}

export function NewBookDialog({
  open,
  onClose,
  onCreated,
}: NewBookDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState(1000);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const createMut = useMutation({
    mutationFn: () =>
      projectApi.create({
        name: name.trim(),
        dailyGoal,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onCreated?.(project.id);
      setName("");
      setDailyGoal(1000);
      setError(null);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "新建书籍失败，请检查书名后重试。")),
  });

  const canSubmit = name.trim().length > 0 && dailyGoal > 0 && !createMut.isPending;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="新建一本书"
      overlayClassName="flex items-center justify-center p-6"
      panelClassName="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
    >
      <motion.div
        className="space-y-3"
        variants={reduceMotion ? fadeOnly : staggerContainer}
        initial="initial"
        animate="animate"
      >
        <motion.h3
          className="flex items-center gap-2 text-base font-semibold"
          variants={reduceMotion ? fadeOnly : staggerItem}
        >
          <BookOpen aria-hidden className="h-4 w-4 text-accent-300" />
          新建一本书
        </motion.h3>

        <motion.label className="block" htmlFor="new-book-name" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">书名</span>
          <input
            id="new-book-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="比如：龙渊"
            maxLength={80}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) createMut.mutate();
            }}
          />
        </motion.label>

        <motion.label className="block" htmlFor="new-book-daily-goal" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">每日字数目标</span>
          <input
            id="new-book-daily-goal"
            type="number"
            min={100}
            step={100}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value) || 1000)}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </motion.label>

        <motion.div className="text-[11px] text-ink-500" variants={reduceMotion ? fadeOnly : staggerItem}>
          创建后会在工作目录下生成 <code className="text-ink-300">projects/{name.trim() || "<书名>"}</code>，
          含 <code className="text-ink-300">chapters/</code>、<code className="text-ink-300">characters/</code>、
          <code className="text-ink-300">world/</code> 等子目录。
        </motion.div>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200"
              role="alert"
              variants={reduceMotion ? fadeOnly : staggerItem}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="flex justify-end gap-2" variants={reduceMotion ? fadeOnly : staggerItem}>
          <motion.button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
            {...buttonMotion}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            className="inline-flex min-w-16 items-center justify-center gap-1.5 rounded-md bg-accent-500/30 px-3 py-1.5 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:cursor-default disabled:opacity-40"
            {...(canSubmit ? buttonMotion : {})}
          >
            {createMut.isPending ? <MotionSpinner className="h-3.5 w-3.5" /> : null}
            {createMut.isPending ? "创建中…" : "创建"}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatedDialog>
  );
}
