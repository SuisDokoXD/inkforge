import type { OutlineCardRecord } from "@inkforge/shared";
import { ClipboardList, FileSearch, PenLine, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";

interface ChapterWorkflowBarProps {
  focusMode: boolean;
  graphemes: number;
  linkedOutlineCard: OutlineCardRecord | null;
  onReviewChapter: () => void;
  onAutoWriteChapter: () => void;
  onResearchChapter: () => void;
  onOpenOutlineCard: () => void;
}

export function ChapterWorkflowBar({
  focusMode,
  graphemes,
  linkedOutlineCard,
  onReviewChapter,
  onAutoWriteChapter,
  onResearchChapter,
  onOpenOutlineCard,
}: ChapterWorkflowBarProps): JSX.Element {
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
      className={`flex min-h-10 flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900/45 px-4 py-2 text-xs text-ink-300 transition-opacity duration-200 ${
        focusMode ? "opacity-40 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
      variants={reduceMotion ? fadeOnly : staggerContainer}
      initial="initial"
      animate="animate"
    >
      <div className="min-w-0 flex-1 truncate">
        <span className="text-ink-500">当前章节</span>
        <span className="mx-1 text-ink-600">·</span>
        <span className="tabular-nums">{graphemes} 字</span>
        <span className="mx-1 text-ink-600">·</span>
        <AnimatePresence initial={false} mode="wait">
          {linkedOutlineCard ? (
            <motion.span
              key={`outline:${linkedOutlineCard.id}`}
              className="inline-block max-w-[28rem] truncate align-bottom text-ink-400"
              title={linkedOutlineCard.title}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 4 }}
              transition={{ duration: 0.18 }}
            >
              大纲卡：{linkedOutlineCard.title}
            </motion.span>
          ) : (
            <motion.span
              key="outline:none"
              className="inline-block text-ink-500"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 4 }}
              transition={{ duration: 0.18 }}
            >
              未关联大纲卡
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        className="flex shrink-0 flex-wrap items-center gap-1.5"
        variants={reduceMotion ? undefined : staggerContainer}
      >
        <motion.button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onReviewChapter}
          variants={itemMotion}
          {...buttonMotion}
        >
          <FileSearch className="h-3.5 w-3.5" />
          本章审查
        </motion.button>
        <motion.button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onAutoWriteChapter}
          variants={itemMotion}
          {...buttonMotion}
        >
          <PenLine className="h-3.5 w-3.5" />
          续写精修
        </motion.button>
        <motion.button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onResearchChapter}
          title="打开资料检索，并带入本章关键词"
          variants={itemMotion}
          {...buttonMotion}
        >
          <Search className="h-3.5 w-3.5" />
          查本章资料
        </motion.button>
        <AnimatePresence initial={false}>
          {linkedOutlineCard ? (
            <motion.button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
              onClick={onOpenOutlineCard}
              title={`查看大纲卡：${linkedOutlineCard.title}`}
              variants={itemMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              {...buttonMotion}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              查看大纲卡
            </motion.button>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
