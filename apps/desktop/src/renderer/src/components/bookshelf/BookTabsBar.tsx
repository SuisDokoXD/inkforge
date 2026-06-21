import type { BookSummary } from "@inkforge/shared";
import { BookOpen, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useBookshelfStore } from "../../stores/bookshelf-store";
import {
  fadeOnly,
  fadeSlideUp,
} from "../../lib/motion-tokens";
import { CoverUploader } from "./CoverUploader";
import { Button, IconButton } from "../ui";

interface BookTabsBarProps {
  books: BookSummary[];
  /** 触发"打开新书"对话框/列表 */
  onOpenNewBook: () => void;
  /** 触发"创建新书"对话框 */
  onCreateBook?: () => void;
}

/**
 * 多本书的标签页条。已打开的 tab 横向排列，并提供打开/新建入口。
 */
export function BookTabsBar({
  books,
  onOpenNewBook,
  onCreateBook,
}: BookTabsBarProps): JSX.Element {
  const tabs = useBookshelfStore((s) => s.tabs);
  const activeProjectId = useBookshelfStore((s) => s.activeProjectId);
  const setActive = useBookshelfStore((s) => s.setActiveBookTab);
  const closeTab = useBookshelfStore((s) => s.closeBookTab);
  const reduceMotion = useReducedMotion() === true;
  const tabMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  const bookMap = new Map(books.map((b) => [b.project.id, b]));

  return (
    <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-ink-700 bg-ink-900/60 px-2 py-1 scrollbar-thin">
      <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const book = bookMap.get(tab.projectId);
          const active = tab.projectId === activeProjectId;
          const name = book?.project.name ?? "(已删除)";
          return (
            <motion.div
              key={tab.projectId}
              layout
              variants={tabMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`group flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
                active
                  ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                  : "text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
              }`}
            >
              <button
                type="button"
                onClick={() => setActive(tab.projectId)}
                className="flex min-w-0 items-center gap-2"
                aria-current={active ? "page" : undefined}
                aria-label={`切换到书籍标签：${name}`}
                title={name}
              >
                <CoverUploader
                  projectId={tab.projectId}
                  size="sm"
                  editable={false}
                  fallbackName={name}
                />
                <span className="max-w-[140px] truncate">{name}</span>
              </button>
              <IconButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.projectId);
                }}
                className="h-5 w-5 text-ink-500 opacity-0 transition-opacity hover:bg-transparent hover:text-rose-400 focus-visible:opacity-100 group-hover:opacity-100"
                variant="ghost"
                size="xs"
                aria-label={`关闭书籍标签：${name}`}
                title="关闭"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <Button
        type="button"
        onClick={onOpenNewBook}
        className="px-2 py-1"
        variant="ghost"
        size="sm"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        <span>打开</span>
      </Button>
      {onCreateBook && (
        <Button
          type="button"
          onClick={onCreateBook}
          className="bg-accent-500/20 px-2 py-1 text-accent-200 hover:bg-accent-500/30"
          variant="accentSoft"
          size="sm"
          title="新建一本书"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          <span>新建</span>
        </Button>
      )}
      {tabs.length === 0 && (
        <motion.div
          className="ml-2 self-center text-xs text-ink-500"
          variants={tabMotion}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          点击「新建」创建第一本书
        </motion.div>
      )}
    </div>
  );
}
