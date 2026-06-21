import { useState, type ReactNode } from "react";
import type { BookSummary } from "@inkforge/shared";
import { BookOpen, Clock3, Library, Pencil, Plus, Settings, Target, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CoverUploader } from "./CoverUploader";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { Badge, Button, IconButton } from "../ui";

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

function fmtDate(value: string | null): string {
  if (!value) return "尚未编辑";
  return new Date(value).toLocaleDateString();
}

/**
 * 第一次进入书房或点新建时显示的"全部书"网格选择器。
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
  const reduceMotion = useReducedMotion() === true;
  const [activeActionBookId, setActiveActionBookId] = useState<string | null>(null);
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const totalWords = books.reduce((sum, book) => sum + book.totalWords, 0);
  const totalChapters = books.reduce((sum, book) => sum + book.chapterCount, 0);
  const todayWords = books.reduce((sum, book) => sum + book.todayWords, 0);
  const recentBooks = [...books]
    .sort((a, b) => {
      const aTime = new Date(a.lastChapterUpdatedAt ?? a.project.lastOpened ?? a.project.createdAt).getTime();
      const bTime = new Date(b.lastChapterUpdatedAt ?? b.project.lastOpened ?? b.project.createdAt).getTime();
      return bTime - aTime;
    })
    .slice(0, 4);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-900">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <Library size={16} className="text-accent-300" />
          全部书籍
        </h2>
        <div className="flex items-center gap-2">
          {onCreateBook && (
            <Button
              type="button"
              onClick={onCreateBook}
              className="h-8"
              variant="primary"
              size="sm"
            >
              <Plus size={14} aria-hidden />
              新建书籍
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              onClick={onClose}
              className="px-2 py-1"
              variant="ghost"
              size="sm"
            >
              关闭
            </Button>
          )}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,420px)_minmax(0,1fr)] overflow-hidden">
        <div className="min-h-0 overflow-y-auto border-r border-ink-700/70 p-4 scrollbar-thin">
        {books.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-800/30 px-6 py-10 text-center">
            <BookOpen size={36} className="text-ink-500" />
            <div className="text-sm font-medium text-ink-200">还没有任何书籍</div>
            <p className="max-w-xs text-xs leading-6 text-ink-500">
              先创建一本书，之后章节、素材、人物和模型写作都会围绕这本书组织。
            </p>
            {onCreateBook && (
              <Button
                type="button"
                onClick={onCreateBook}
                className="h-9 px-4"
                variant="primary"
                size="md"
              >
                <Plus size={15} aria-hidden />
                创建第一本书
              </Button>
            )}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-3"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {books.map((book) => {
              const opened = openIds.has(book.project.id);
              return (
                <motion.div
                  key={book.project.id}
                  variants={reduceMotion ? fadeOnly : staggerItem}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  transition={SPRING_SNAPPY}
                  onHoverStart={() => setActiveActionBookId(book.project.id)}
                  onHoverEnd={() => setActiveActionBookId(null)}
                  onFocusCapture={() => setActiveActionBookId(book.project.id)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setActiveActionBookId(null);
                    }
                  }}
                  className={`group relative flex gap-3 rounded-lg border p-3 text-left transition-colors ${
                    opened
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-ink-700 bg-ink-900/40 hover:border-accent-500/30 hover:bg-ink-800/60"
                  }`}
                >
                  <motion.button
                    type="button"
                    onClick={() => onPickBook(book.project.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    whileTap={reduceMotion ? undefined : tapPress}
                    transition={SPRING_SNAPPY}
                  >
                    <CoverUploader
                      projectId={book.project.id}
                      size="sm"
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
                          <Badge
                            tone="neutral"
                            className="rounded bg-violet-500/20 px-1 py-0 font-normal text-violet-200 ring-violet-500/30"
                          >
                            初稿 {book.originCounts["ai-auto"]}
                          </Badge>
                        )}
                        {book.originCounts["ai-assisted"] > 0 && (
                          <Badge
                            tone="neutral"
                            className="rounded bg-sky-500/20 px-1 py-0 font-normal text-sky-200 ring-sky-500/30"
                          >
                            陪写 {book.originCounts["ai-assisted"]}
                          </Badge>
                        )}
                        {book.originCounts.manual > 0 && (
                          <Badge
                            tone="neutral"
                            className="rounded bg-emerald-500/20 px-1 py-0 font-normal text-emerald-200 ring-emerald-500/30"
                          >
                            手写 {book.originCounts.manual}
                          </Badge>
                        )}
                      </div>
                      {opened && (
                        <Badge
                          tone="accent"
                          className="mt-1 flex w-fit rounded bg-accent-500/15 px-1.5 py-0 font-normal text-accent-300 ring-accent-500/25"
                        >
                          已打开为标签页
                        </Badge>
                      )}
                    </div>
                  </motion.button>
                  {(onRenameBook || onDeleteBook || onOpenSettings) && (
                    <AnimatePresence initial={false}>
                      {activeActionBookId === book.project.id ? (
                        <motion.div
                          key="book-actions"
                          className="absolute right-2 top-2 flex gap-1"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          {onOpenSettings && (
                            <IconButton
                              type="button"
                              title="设定 / 全局世界观"
                              aria-label={`打开《${book.project.name}》的设定`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenSettings(book);
                              }}
                              className="h-7 w-7 bg-ink-900/90 text-ink-300 hover:bg-accent-500/25 hover:text-accent-100"
                              variant="ghost"
                              size="xs"
                            >
                              <Settings size={14} aria-hidden />
                            </IconButton>
                          )}
                          {onRenameBook && (
                            <IconButton
                              type="button"
                              title="改名 / 修改基础信息"
                              aria-label={`编辑《${book.project.name}》的基础信息`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRenameBook(book);
                              }}
                              className="h-7 w-7 bg-ink-900/90 text-ink-300 hover:bg-sky-500/25 hover:text-sky-100"
                              variant="ghost"
                              size="xs"
                            >
                              <Pencil size={14} aria-hidden />
                            </IconButton>
                          )}
                          {onDeleteBook && (
                            <IconButton
                              type="button"
                              title="删除书籍"
                              aria-label={`删除《${book.project.name}》`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteBook(book);
                              }}
                              className="h-7 w-7 bg-ink-900/90 text-ink-300 hover:bg-rose-500/25 hover:text-rose-100"
                              variant="ghost"
                              size="xs"
                            >
                              <Trash2 size={14} aria-hidden />
                            </IconButton>
                          )}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
        </div>

        <div className="min-h-0 overflow-y-auto p-6 scrollbar-thin">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <section className="rounded-xl border border-ink-700 bg-ink-800/35 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-ink-100">书房概览</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-400">
                    从左侧打开一本书后，会进入它的章节列表；也可以在这里新建书籍，先把项目架起来。
                  </p>
                </div>
                {onCreateBook && (
                  <Button
                    type="button"
                    onClick={onCreateBook}
                    className="h-9 shrink-0 border-accent-500/50 bg-accent-500/15 px-3 text-accent-100 hover:bg-accent-500/25"
                    variant="accentSoft"
                    size="md"
                  >
                    <Plus size={15} aria-hidden />
                    新书
                  </Button>
                )}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <StatCard icon={<BookOpen size={16} />} label="书籍" value={`${books.length} 本`} />
                <StatCard icon={<Library size={16} />} label="章节" value={`${totalChapters} 章`} />
                <StatCard icon={<Target size={16} />} label="总字数" value={`${fmtNum(totalWords)} 字`} />
              </div>
              <div className="mt-3 rounded-md border border-ink-700 bg-ink-950/50 px-3 py-2 text-xs text-ink-400">
                今日新增 <span className="font-medium text-ink-100">{fmtNum(todayWords)}</span> 字
              </div>
            </section>

            <section className="rounded-xl border border-ink-700 bg-ink-800/25 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 size={16} className="text-ink-400" />
                <h3 className="text-sm font-semibold text-ink-100">最近编辑</h3>
              </div>
              {recentBooks.length === 0 ? (
                <div className="rounded-md border border-dashed border-ink-700 py-8 text-center text-xs text-ink-500">
                  还没有最近编辑记录。
                </div>
              ) : (
                <div className="grid gap-2">
                  {recentBooks.map((book) => (
                    <motion.button
                      key={book.project.id}
                      type="button"
                      onClick={() => onPickBook(book.project.id)}
                      className="flex items-center justify-between gap-3 rounded-md border border-ink-700 bg-ink-950/50 px-3 py-2 text-left hover:border-accent-500/40 hover:bg-accent-500/10"
                      {...buttonMotion}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink-100">{book.project.name}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {book.chapterCount} 章 · {fmtNum(book.totalWords)} 字
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">
                        {fmtDate(book.lastChapterUpdatedAt ?? book.project.lastOpened)}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-ink-700 bg-ink-800/20 p-5">
              <h3 className="text-sm font-semibold text-ink-100">这里可以做什么</h3>
              <div className="mt-3 grid gap-2 text-xs leading-6 text-ink-400 md:grid-cols-2">
                <p className="rounded-md bg-ink-950/45 p-3">打开一本书，管理它的章节、来源标签、版本备份和章节日志。</p>
                <p className="rounded-md bg-ink-950/45 p-3">给书籍补充设定和世界观，后续模型写作会读取这些资料。</p>
                <p className="rounded-md bg-ink-950/45 p-3">把不同作品同时打开成标签页，在多本书之间快速切换。</p>
                <p className="rounded-md bg-ink-950/45 p-3">从这里新建书籍，再去写作页继续正文创作。</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-950/55 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-500">
        <span className="text-accent-300">{icon}</span>
        {label}
      </div>
      <div className="text-lg font-semibold text-ink-100">{value}</div>
    </div>
  );
}
