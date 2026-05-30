import type { BookSummary } from "@inkforge/shared";
import { useBookshelfStore } from "../../stores/bookshelf-store";
import { CoverUploader } from "./CoverUploader";

interface BookTabsBarProps {
  books: BookSummary[];
  /** 触发"打开新书"对话框/列表 */
  onOpenNewBook: () => void;
  /** 触发"创建新书"对话框 */
  onCreateBook?: () => void;
}

/**
 * 多本书的标签页条。已打开的 tab 横向排列 + 一个 ➕ 入口。
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

  const bookMap = new Map(books.map((b) => [b.project.id, b]));

  return (
    <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-ink-700 bg-ink-900/60 px-2 py-1 scrollbar-thin">
      {tabs.map((tab) => {
        const book = bookMap.get(tab.projectId);
        const active = tab.projectId === activeProjectId;
        const name = book?.project.name ?? "(已删除)";
        return (
          <div
            key={tab.projectId}
            className={`group flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
              active
                ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                : "text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
            }`}
          >
            <button
              type="button"
              onClick={() => setActive(tab.projectId)}
              className="flex items-center gap-2"
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.projectId);
              }}
              className="text-ink-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              title="关闭"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onOpenNewBook}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
      >
        <span aria-hidden>➕</span>
        <span>打开</span>
      </button>
      {onCreateBook && (
        <button
          type="button"
          onClick={onCreateBook}
          className="flex items-center gap-1 rounded-md bg-accent-500/20 px-2 py-1 text-xs text-accent-200 hover:bg-accent-500/30"
          title="新建一本书"
        >
          <span aria-hidden>📖</span>
          <span>新建</span>
        </button>
      )}
      {tabs.length === 0 && (
        <div className="ml-2 self-center text-xs text-ink-500">
          点击「📖 新建」创建第一本书
        </div>
      )}
    </div>
  );
}
