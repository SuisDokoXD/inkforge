import type { OutlineCardRecord } from "@inkforge/shared";
import { ClipboardList, FileSearch, PenLine, Search } from "lucide-react";

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
  return (
    <div
      className={`flex min-h-10 flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900/45 px-4 py-2 text-xs text-ink-300 transition-opacity duration-300 ${
        focusMode ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
    >
      <div className="min-w-0 flex-1 truncate">
        <span className="text-ink-500">当前章节</span>
        <span className="mx-1 text-ink-600">·</span>
        <span>{graphemes} 字</span>
        {linkedOutlineCard ? (
          <>
            <span className="mx-1 text-ink-600">·</span>
            <span className="truncate text-ink-400" title={linkedOutlineCard.title}>
              大纲卡：{linkedOutlineCard.title}
            </span>
          </>
        ) : (
          <>
            <span className="mx-1 text-ink-600">·</span>
            <span className="text-ink-500">未关联大纲卡</span>
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onReviewChapter}
        >
          <FileSearch className="h-3.5 w-3.5" />
          本章审查
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onAutoWriteChapter}
        >
          <PenLine className="h-3.5 w-3.5" />
          继续自动写作
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
          onClick={onResearchChapter}
          title="打开资料检索，并带入本章关键词"
        >
          <Search className="h-3.5 w-3.5" />
          查本章资料
        </button>
        {linkedOutlineCard ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-xs text-ink-200 transition-colors hover:bg-ink-700"
            onClick={onOpenOutlineCard}
            title={`查看大纲卡：${linkedOutlineCard.title}`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            查看大纲卡
          </button>
        ) : null}
      </div>
    </div>
  );
}
