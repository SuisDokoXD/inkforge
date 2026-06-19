import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NotebookPen, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { ChapterOrigin, ChapterRecord } from "@inkforge/shared";
import { chapterApi, originTagApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { AutoWriterPanel } from "../auto-writer/AutoWriterPanel";
import { ChapterLogDrawer } from "../log/ChapterLogDrawer";
import { SnapshotMenu } from "../snapshot/SnapshotMenu";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { MotionSpinner } from "../MotionSpinner";

const ORIGIN_BADGE: Record<ChapterOrigin, { label: string; cls: string }> = {
  "ai-auto": { label: "初稿", cls: "bg-violet-500/20 text-violet-200" },
  "ai-assisted": { label: "陪写", cls: "bg-sky-500/20 text-sky-200" },
  manual: { label: "手写", cls: "bg-emerald-500/20 text-emerald-200" },
};

interface ChapterListItemProps {
  chapter: ChapterRecord;
  projectId: string;
  /** 点击章节标题：交给上层（PR-7 跳转编辑器或 AutoWriter 面板）。 */
  onOpen?: (chapter: ChapterRecord) => void;
}

export function ChapterListItem({
  chapter,
  projectId,
  onOpen,
}: ChapterListItemProps): JSX.Element {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion() === true;
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [autoWriterOpen, setAutoWriterOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(chapter.title);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const tagQuery = useQuery({
    queryKey: ["chapterOrigin", chapter.id],
    queryFn: () => originTagApi.get({ chapterId: chapter.id }),
    staleTime: 60_000,
  });

  const setTagMut = useMutation({
    mutationFn: (origin: ChapterOrigin) =>
      originTagApi.set({ chapterId: chapter.id, origin }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chapterOrigin", chapter.id] });
      void queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "章节来源更新失败，请稍后重试。"));
    },
  });

  const renameMut = useMutation({
    mutationFn: (title: string) =>
      chapterApi.update({ id: chapter.id, title }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      setRenaming(false);
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "章节改名失败，请稍后重试。"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => chapterApi.delete({ id: chapter.id }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      setDeleteConfirming(false);
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "章节删除失败，请稍后重试。"));
    },
  });

  useEffect(() => {
    setDeleteConfirming(false);
  }, [chapter.id, chapter.title]);

  const origin: ChapterOrigin = tagQuery.data?.origin ?? "manual";
  const badge = ORIGIN_BADGE[origin];

  const commitRename = (): void => {
    const next = renameDraft.trim();
    if (!next || next === chapter.title) {
      setRenaming(false);
      setRenameDraft(chapter.title);
      return;
    }
    renameMut.mutate(next);
  };

  return (
    <motion.li
      layout
      className="relative flex flex-col gap-1 border-b border-ink-700/50 px-3 py-2 hover:bg-ink-800/40"
      variants={reduceMotion ? fadeOnly : staggerItem}
      initial="initial"
      animate="animate"
    >
      <div className="flex items-center gap-2">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              type="text"
              autoFocus
              aria-label="章节标题"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenameDraft(chapter.title);
                  setRenaming(false);
                }
              }}
              className="min-w-0 flex-1 rounded border border-accent-500/40 bg-ink-900 px-2 py-1 text-sm text-ink-100 focus:outline-none"
            />
            <AnimatePresence initial={false}>
              {renameMut.isPending ? (
                <motion.span
                  key="rename-saving"
                  className="inline-flex items-center text-accent-200"
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  role="status"
                  aria-label="正在保存章节标题"
                >
                  <MotionSpinner className="h-3.5 w-3.5" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        ) : (
          <motion.button
            type="button"
            onClick={() => onOpen?.(chapter)}
            onDoubleClick={() => {
              setRenameDraft(chapter.title);
              setRenaming(true);
            }}
            className="flex-1 truncate text-left text-sm text-ink-100 hover:text-accent-200"
            title={`${chapter.title}（双击改名）`}
            {...buttonMotion}
          >
            {chapter.title || "（未命名）"}
          </motion.button>
        )}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-500">
        <span>{chapter.wordCount} 字</span>
        {chapter.updatedAt && (
          <span>· {new Date(chapter.updatedAt).toLocaleDateString()}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <select
            value={origin}
            onChange={(e) => setTagMut.mutate(e.target.value as ChapterOrigin)}
            className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-[10px] text-ink-300"
            aria-label={`设置《${chapter.title || "未命名章节"}》的章节来源`}
            title="设置章节来源"
          >
            <option value="ai-auto">模型初稿</option>
            <option value="ai-assisted">模型陪写</option>
            <option value="manual">我手写</option>
          </select>
          <motion.button
            type="button"
            onClick={() => setAutoWriterOpen(true)}
            className="rounded bg-accent-500/20 px-2 py-0.5 text-[11px] text-accent-200 hover:bg-accent-500/30"
            title="打开续写精修"
            {...buttonMotion}
          >
            续写
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setLogOpen(true)}
            className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-600"
            title="章节日志"
            {...buttonMotion}
          >
            <NotebookPen className="mr-1 inline h-3 w-3" aria-hidden />
            日志
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setSnapshotOpen((v) => !v)}
            className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-600"
            aria-label="打开章节版本备份"
            title="章节版本备份"
            {...buttonMotion}
          >
            <RotateCcw className="mr-1 inline h-3 w-3" aria-hidden />
            备份
          </motion.button>
          <motion.button
            type="button"
            onClick={() => {
              setDeleteConfirming(false);
              setRenameDraft(chapter.title);
              setRenaming(true);
            }}
            className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-sky-500/30 hover:text-sky-100"
            aria-label="重命名章节"
            title="改名"
            {...buttonMotion}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </motion.button>
          <AnimatePresence initial={false} mode="wait">
            {deleteConfirming ? (
              <motion.div
                key="delete-confirm"
                variants={fadeOnly}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex items-center gap-1"
              >
                <span className="max-w-52 truncate text-[11px] text-rose-200">
                  不会删除磁盘 .md 文件
                </span>
                <motion.button
                  type="button"
                  onClick={() => setDeleteConfirming(false)}
                  disabled={deleteMut.isPending}
                  className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-600 disabled:cursor-default disabled:opacity-50"
                  {...(deleteMut.isPending ? {} : buttonMotion)}
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => deleteMut.mutate()}
                  disabled={deleteMut.isPending}
                  className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[11px] text-rose-100 hover:bg-rose-500/30 disabled:cursor-default disabled:opacity-50"
                  {...(deleteMut.isPending ? {} : buttonMotion)}
                >
                  {deleteMut.isPending ? <MotionSpinner className="h-3 w-3" /> : null}
                  {deleteMut.isPending ? "删除中" : "确认删除"}
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="delete-start"
                type="button"
                onClick={() => setDeleteConfirming(true)}
                disabled={deleteMut.isPending}
                className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-rose-500/30 hover:text-rose-100 disabled:opacity-50"
                aria-label="删除章节"
                title="删除章节"
                variants={fadeOnly}
                initial="initial"
                animate="animate"
                exit="exit"
                {...buttonMotion}
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.div
            className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100"
            role="alert"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {actionError}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {snapshotOpen && (
        <div className="absolute right-2 top-full z-30 mt-1">
          <SnapshotMenu
            chapterId={chapter.id}
            projectId={projectId}
            onClose={() => setSnapshotOpen(false)}
          />
        </div>
      )}
      {logOpen && (
        <ChapterLogDrawer
          chapterId={chapter.id}
          projectId={projectId}
          chapterTitle={chapter.title}
          onClose={() => setLogOpen(false)}
        />
      )}
      {autoWriterOpen && (
        <AutoWriterPanel
          chapterId={chapter.id}
          projectId={projectId}
          chapterTitle={chapter.title}
          chapterWordCount={chapter.wordCount}
          onClose={() => setAutoWriterOpen(false)}
        />
      )}
    </motion.li>
  );
}
