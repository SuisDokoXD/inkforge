import type { BookSummary } from "@inkforge/shared";
import { motion, useReducedMotion } from "motion/react";
import { CoverUploader } from "./CoverUploader";
import { staggerContainer, staggerItem, fadeOnly, hoverLift, SPRING_SNAPPY } from "../../lib/motion-tokens";

interface BookListGridProps {
  books: BookSummary[];
  /** 当前已经打开 tab 的 projectId 集合，用于在网格中标识。 */
  openIds: Set<string>;
  onPickBook: (projectId: string) => void;
  onClose?: () => void;
  /** 触发"新建书籍"对话框 */
  onCreateBook?: () => void;
  /** 触发"编辑书名"对话框（v20） */
  onRenameBook?: (book: BookSummary) => void;
  /** 触发"删除书籍"对话框（v20） */
  onDeleteBook?: (book: BookSummary) => void;
  /** 触发"书籍设定 / 全局世界观"对话框（v20） */
  onOpenSettings?: (book: BookSummary) => void;
}

function fmtNum(n: number): string {
  if (n < 10_000) return String(n);
  return `${(n / 10_000).toFixed(1)} 万`;
}

/**
 * 第一次进入书房或点 ➕ 时显示的"全部书"网格选择器。
 * 现有 OnboardingPage / WorkspacePage 不动；这里用同样的 ink 颜色风格。
 */
export function BookListGrid({
  books,
  openIds,
  onPickBook,
  onClose,
  onCreateBook,
  onRenameBook,
  onDeleteBook,
  onOpenSettings,
}: BookListGridProps): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <h2 className="text-sm font-semibold text-ink-100">📚 全部书籍</h2>
        <div className="flex items-center gap-2">
          {onCreateBook && (
            <button
              type="button"
              onClick={onCreateBook}
              className="rounded-md bg-accent-500/30 px-3 py-1 text-xs font-semibold text-accent-100 hover:bg-accent-500/40"
            >
              ➕ 新建书籍
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
            >
              关闭
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {books.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-ink-400">还没有任何书籍</div>
            {onCreateBook && (
              <button
                type="button"
                onClick={onCreateBook}
                className="rounded-md bg-accent-500/30 px-4 py-2 text-sm font-semibold text-accent-100 hover:bg-accent-500/40"
              >
                ➕ 创建第一本书
              </button>
            )}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {books.map((book) => {
              const opened = openIds.has(book.project.id);
              return (
                <motion.div
                  key={book.project.id}
                  variants={reduce ? fadeOnly : staggerItem}
                  whileHover={reduce ? undefined : hoverLift}
                  transition={SPRING_SNAPPY}
                  className={`group relative flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                    opened
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-ink-700 bg-ink-900/40 hover:border-accent-500/30 hover:bg-ink-800/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onPickBook(book.project.id)}
                    className="flex w-full flex-col items-center gap-2 text-left"
                  >
                    <CoverUploader
                      projectId={book.project.id}
                      size="lg"
                      editable={false}
                      fallbackName={book.project.name}
                    />
                    <div className="w-full">
                      <div className="truncate text-sm font-medium text-ink-100">
                        {book.project.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-ink-400">
                        <span>{book.chapterCount} 章</span>
                        <span>· {fmtNum(book.totalWords)} 字</span>
                      </div>
                      <div className="mt-1 flex gap-1 text-[10px]">
                        {book.originCounts["ai-auto"] > 0 && (
                          <span className="rounded bg-violet-500/20 px-1 text-violet-200">
                            🤖 {book.originCounts["ai-auto"]}
                          </span>
                        )}
                        {book.originCounts["ai-assisted"] > 0 && (
                          <span className="rounded bg-sky-500/20 px-1 text-sky-200">
                            ✍🤖 {book.originCounts["ai-assisted"]}
                          </span>
                        )}
                        {book.originCounts.manual > 0 && (
                          <span className="rounded bg-emerald-500/20 px-1 text-emerald-200">
                            ✍ {book.originCounts.manual}
                          </span>
                        )}
                      </div>
                      {opened && (
                        <div className="mt-1 text-[10px] text-accent-300">已在 Tab 中打开</div>
                      )}
                    </div>
                  </button>
                  {/* hover 时显示的快捷操作（v20） */}
                  {(onRenameBook || onDeleteBook || onOpenSettings) && (
                    <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                      {onOpenSettings && (
                        <button
                          type="button"
                          title="设定 / 全局世界观"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSettings(book);
                          }}
                          className="rounded bg-ink-900/80 px-1.5 py-0.5 text-[12px] text-ink-200 hover:bg-accent-500/30 hover:text-accent-100"
                        >
                          ⚙
                        </button>
                      )}
                      {onRenameBook && (
                        <button
                          type="button"
                          title="改名 / 修改基础信息"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRenameBook(book);
                          }}
                          className="rounded bg-ink-900/80 px-1.5 py-0.5 text-[12px] text-ink-200 hover:bg-sky-500/30 hover:text-sky-100"
                        >
                          ✏
                        </button>
                      )}
                      {onDeleteBook && (
                        <button
                          type="button"
                          title="删除书籍"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBook(book);
                          }}
                          className="rounded bg-ink-900/80 px-1.5 py-0.5 text-[12px] text-ink-200 hover:bg-rose-500/30 hover:text-rose-100"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
