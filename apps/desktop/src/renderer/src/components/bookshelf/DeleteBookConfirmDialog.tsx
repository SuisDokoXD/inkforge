import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProjectRecord } from "@inkforge/shared";
import { Trash2 } from "lucide-react";
import { AnimatedDialog } from "../AnimatedDialog";
import { projectApi } from "../../lib/api";
import { useBookshelfStore } from "../../stores/bookshelf-store";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";

interface DeleteBookConfirmDialogProps {
  project: ProjectRecord | null;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

/**
 * 删书二次确认。两个选项：
 * - 仅删元数据（数据库行 + 关联表）：磁盘上的 Markdown / 资源 全部保留
 * - 同时删除磁盘文件：调 IPC removeFiles=true
 *
 * 任一情况都会从 bookshelf-store 移除对应 tab。
 */
export function DeleteBookConfirmDialog({
  project,
  onClose,
  onDeleted,
}: DeleteBookConfirmDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const closeTab = useBookshelfStore((s) => s.closeBookTab);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [removeFiles, setRemoveFiles] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (input: { id: string; removeFiles: boolean }) =>
      projectApi.delete(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      closeTab(input.id);
      onDeleted?.(input.id);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "删除书籍失败，请稍后重试。")),
  });

  useEffect(() => {
    setRemoveFiles(false);
    setConfirmText("");
    setError(null);
  }, [project?.id]);

  const requiredText = project?.name ?? "";
  const canSubmit = project !== null && confirmText === requiredText && !deleteMut.isPending;

  return (
    <AnimatedDialog
      open={project !== null}
      onClose={onClose}
      labelledBy="delete-book-title"
      overlayClassName="flex items-center justify-center p-6"
      panelClassName="w-full max-w-md rounded-2xl border border-rose-500/40 bg-ink-800 p-5 text-ink-100 shadow-2xl"
    >
      {project && (
        <>
        <h3 id="delete-book-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-rose-200">
          <Trash2 aria-hidden className="h-4 w-4" />
          删除书籍
        </h3>
        <p className="mb-3 text-xs text-ink-300">
          即将删除《<span className="text-ink-100">{project.name}</span>》。该操作不可撤销。
        </p>

        <label className="mb-3 flex items-start gap-2 text-xs text-ink-300" htmlFor="delete-book-remove-files">
          <input
            id="delete-book-remove-files"
            type="checkbox"
            checked={removeFiles}
            onChange={(e) => setRemoveFiles(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="text-rose-200">同时删除磁盘上的项目目录</strong>
            （含所有章节 .md、版本备份、封面、日志）
            <br />
            <span className="text-ink-500">
              不勾选则仅清理数据库行，磁盘文件保留以便日后手动恢复。
            </span>
          </span>
        </label>

        <label className="mb-3 block" htmlFor="delete-book-confirm-text">
          <span className="mb-1 block text-[11px] text-ink-400">
            为确认，请输入完整书名：
            <code className="ml-1 rounded bg-ink-900 px-1 text-rose-200">
              {requiredText}
            </code>
          </span>
          <input
            id="delete-book-confirm-text"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
          />
        </label>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              className="mb-3 rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200"
              role="alert"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2">
          <motion.button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
            whileHover={reduceMotion ? undefined : hoverLift}
            whileTap={reduceMotion ? undefined : tapPress}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            onClick={() => {
              if (!project) return;
              deleteMut.mutate({ id: project.id, removeFiles });
            }}
            disabled={!canSubmit}
            className="rounded-md bg-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/50 disabled:opacity-40"
            whileHover={reduceMotion || !canSubmit ? undefined : hoverLift}
            whileTap={reduceMotion || !canSubmit ? undefined : tapPress}
          >
            {deleteMut.isPending
              ? "删除中…"
              : removeFiles
              ? "永久删除（含文件）"
              : "删除元数据"}
          </motion.button>
        </div>
        </>
      )}
    </AnimatedDialog>
  );
}
