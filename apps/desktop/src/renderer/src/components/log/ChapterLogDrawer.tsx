import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NotebookPen, Trash2, X } from "lucide-react";
import type {
  ChapterLogEntryKind,
  ChapterLogEntryRecord,
} from "@inkforge/shared";
import { chapterLogApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  DUR,
  EASE_STANDARD,
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { MotionSpinner } from "../MotionSpinner";

const KIND_BADGE: Record<ChapterLogEntryKind, { label: string; cls: string }> = {
  progress: { label: "进度", cls: "bg-emerald-500/20 text-emerald-200" },
  "ai-run": { label: "模型运行", cls: "bg-violet-500/20 text-violet-200" },
  manual: { label: "手记", cls: "bg-sky-500/20 text-sky-200" },
  "daily-reminder": { label: "每日", cls: "bg-accent-500/20 text-accent-200" },
};

interface ChapterLogDrawerProps {
  chapterId: string;
  projectId: string;
  chapterTitle?: string;
  onClose: () => void;
}

export function ChapterLogDrawer({
  chapterId,
  projectId,
  chapterTitle,
  onClose,
}: ChapterLogDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const statusMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const drawerMotion = reduceMotion
    ? fadeOnly
    : {
        initial: { opacity: 0, x: 16 },
        animate: {
          opacity: 1,
          x: 0,
          transition: { duration: DUR.base, ease: EASE_STANDARD },
        },
        exit: {
          opacity: 0,
          x: 12,
          transition: { duration: DUR.fast, ease: EASE_STANDARD },
        },
      };
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
      };

  const listQuery = useQuery({
    queryKey: ["chapter-log", chapterId],
    queryFn: () => chapterLogApi.list({ chapterId, limit: 100, desc: true }),
    staleTime: 5_000,
  });

  const appendMut = useMutation({
    mutationFn: (content: string) =>
      chapterLogApi.appendManual({ chapterId, projectId, content }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter-log", chapterId] });
      setDraft("");
    },
    onError: (err) => {
      setError(friendlyErrorMessage(err, "日志保存失败，请稍后重试。"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (entryId: string) => chapterLogApi.delete({ entryId }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter-log", chapterId] });
      setDeleteConfirmId(null);
    },
    onError: (err) => {
      setError(friendlyErrorMessage(err, "日志删除失败，请稍后重试。"));
    },
  });

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    appendMut.mutate(text);
  };

  const entries = listQuery.data ?? [];

  return (
    <motion.aside
      className="fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-full flex-col border-l border-ink-700 bg-ink-800 text-ink-100 shadow-2xl"
      role="complementary"
      aria-label="章节日志"
      variants={drawerMotion}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <NotebookPen className="h-4 w-4 text-accent-300" aria-hidden />
            章节日志
          </h3>
          {chapterTitle && (
            <div className="truncate text-[11px] text-ink-400">{chapterTitle}</div>
          )}
        </div>
        <motion.button
          type="button"
          onClick={onClose}
          className="inline-flex rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
          aria-label="关闭章节日志"
          {...buttonMotion}
        >
          <X className="h-4 w-4" aria-hidden />
        </motion.button>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b border-ink-700 p-3">
        <label htmlFor="chapter-log-draft" className="sr-only">
          新增章节日志
        </label>
        <textarea
          id="chapter-log-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="今天写到这里有什么想记录的？"
          className="h-20 resize-none rounded-md border border-ink-700 bg-ink-900 p-2 text-xs text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            disabled={!draft.trim() || appendMut.isPending}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500/20 px-3 py-1 text-xs text-accent-200 hover:bg-accent-500/30 disabled:cursor-default disabled:opacity-40"
            {...(!draft.trim() || appendMut.isPending ? {} : buttonMotion)}
          >
            {appendMut.isPending ? (
              <MotionSpinner className="h-3.5 w-3.5" />
            ) : (
              <NotebookPen className="h-3.5 w-3.5" aria-hidden />
            )}
            {appendMut.isPending ? "记录中…" : "记录一笔"}
          </motion.button>
          <span className="text-[10px] text-ink-500">{draft.length} 字</span>
        </div>
        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-100"
              role="alert"
              variants={statusMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {error}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        <AnimatePresence initial={false} mode="wait">
          {listQuery.isLoading ? (
            <motion.div
              key="loading"
              role="status"
              className="flex items-center justify-center gap-2 py-4 text-xs text-ink-500"
              variants={statusMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <MotionSpinner className="h-3.5 w-3.5" />
              加载中…
            </motion.div>
          ) : null}
          {listQuery.isSuccess && entries.length === 0 ? (
            <motion.div
              key="empty"
              className="rounded-md border border-ink-700 bg-ink-900/40 px-3 py-4 text-center text-xs leading-5 text-ink-500"
              variants={statusMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              还没有任何条目。模型跑完一轮 / 进度更新 / 手动记录都会出现在这里。
            </motion.div>
          ) : null}
        </AnimatePresence>
        <motion.ul
          className="flex flex-col gap-2"
          variants={reduceMotion ? undefined : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {entries.map((entry) => (
            <LogEntryItem
              key={entry.id}
              entry={entry}
              confirmingDelete={deleteConfirmId === entry.id}
              deleting={deleteMut.isPending && deleteMut.variables === entry.id}
              onAskDelete={() => setDeleteConfirmId(entry.id)}
              onCancelDelete={() => setDeleteConfirmId(null)}
              onConfirmDelete={() => deleteMut.mutate(entry.id)}
            />
          ))}
        </motion.ul>
      </div>
    </motion.aside>
  );
}

function LogEntryItem({
  entry,
  confirmingDelete,
  deleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: ChapterLogEntryRecord;
  confirmingDelete: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
      };
  const badge = KIND_BADGE[entry.kind];
  const meta = entry.metadata ?? {};
  const tokens =
    typeof meta.tokensIn === "number" || typeof meta.tokensOut === "number"
      ? `生成消耗 ${meta.tokensIn ?? 0} 输入量 / ${meta.tokensOut ?? 0} 输出量`
      : null;
  const rewrites = typeof meta.rewrites === "number" ? `重写 ${meta.rewrites} 次` : null;
  return (
    <motion.li
      layout
      className="rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs"
      variants={reduceMotion ? fadeOnly : staggerItem}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] text-ink-500">
          {new Date(entry.createdAt).toLocaleString()}
        </span>
        <div className="ml-auto">
          <AnimatePresence initial={false} mode="wait">
            {confirmingDelete ? (
              <motion.div
                key="delete-confirm"
                className="flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-100"
                variants={fadeOnly}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <span>确认删除？</span>
                <motion.button
                  type="button"
                  className="rounded px-1 py-0.5 text-ink-300 hover:bg-ink-700"
                  onClick={onCancelDelete}
                  {...buttonMotion}
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1 py-0.5 text-rose-100 hover:bg-rose-500/25 disabled:cursor-default disabled:opacity-60"
                  disabled={deleting}
                  onClick={onConfirmDelete}
                  {...(deleting ? {} : buttonMotion)}
                >
                  {deleting ? <MotionSpinner className="h-3 w-3" /> : null}
                  {deleting ? "删除中" : "删除"}
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="delete-start"
                type="button"
                onClick={onAskDelete}
                className="inline-flex text-ink-500 hover:text-rose-400"
                aria-label="删除日志"
                title="删除"
                variants={fadeOnly}
                initial="initial"
                animate="animate"
                exit="exit"
                {...buttonMotion}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-1 whitespace-pre-wrap text-ink-100">{entry.content}</div>
      {(tokens || rewrites) && (
        <div className="mt-1 flex gap-2 text-[10px] text-ink-500">
          {tokens && <span>{tokens}</span>}
          {rewrites && <span>{rewrites}</span>}
        </div>
      )}
    </motion.li>
  );
}
