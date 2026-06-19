import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pencil } from "lucide-react";
import type { ProjectRecord } from "@inkforge/shared";
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

interface EditBookDialogProps {
  /** 当前要编辑的书籍。null 时对话框隐藏。 */
  project: ProjectRecord | null;
  onClose: () => void;
  onSaved?: (project: ProjectRecord) => void;
}

/**
 * 修改书籍基础信息（书名、日均目标）。深度信息（世界观/简介）走 BookSettingsDialog。
 */
export function EditBookDialog({
  project,
  onClose,
  onSaved,
}: EditBookDialogProps): JSX.Element | null {
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

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDailyGoal(project.dailyGoal);
      setError(null);
    }
  }, [project]);

  const updateMut = useMutation({
    mutationFn: () =>
      projectApi.update({
        id: project!.id,
        name: name.trim(),
        dailyGoal,
      }),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onSaved?.(next);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "保存书籍信息失败，请稍后重试。")),
  });

  if (!project) return null;
  const canSubmit =
    name.trim().length > 0 && dailyGoal > 0 && !updateMut.isPending;
  const dirty = name.trim() !== project.name || dailyGoal !== project.dailyGoal;

  return (
    <AnimatedDialog
      open={project !== null}
      onClose={onClose}
      ariaLabel="编辑书籍信息"
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
          <Pencil aria-hidden className="h-4 w-4 text-accent-300" />
          编辑书籍信息
        </motion.h3>

        <motion.label className="block" htmlFor="edit-book-name" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">书名</span>
          <input
            id="edit-book-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit && dirty) updateMut.mutate();
            }}
          />
        </motion.label>

        <motion.label className="block" htmlFor="edit-book-daily-goal" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">每日字数目标</span>
          <input
            id="edit-book-daily-goal"
            type="number"
            min={100}
            step={100}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value) || 1000)}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </motion.label>

        <motion.div className="text-[11px] text-ink-500" variants={reduceMotion ? fadeOnly : staggerItem}>
          注意：改名只更新数据库元数据，不会改动磁盘上的项目目录路径。
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
            onClick={() => updateMut.mutate()}
            disabled={!canSubmit || !dirty}
            className="inline-flex min-w-16 items-center justify-center gap-1.5 rounded-md bg-accent-500/30 px-3 py-1.5 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:cursor-default disabled:opacity-40"
            {...(canSubmit && dirty ? buttonMotion : {})}
          >
            {updateMut.isPending ? <MotionSpinner className="h-3.5 w-3.5" /> : null}
            {updateMut.isPending ? "保存中…" : "保存"}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatedDialog>
  );
}
