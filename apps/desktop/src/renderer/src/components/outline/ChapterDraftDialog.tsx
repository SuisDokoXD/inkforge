import { memo } from "react";
import type { ChapterGenerateFromOutlineResponse } from "@inkforge/shared";
import { BookOpenText, CheckCircle2, FileSearch, PenLine } from "lucide-react";
import { countNonWhitespace } from "./outline-metrics";

export interface ChapterDraftState {
  cardId: string;
  cardTitle: string;
  candidates: ChapterGenerateFromOutlineResponse["candidates"];
  committedChapterId?: string;
  committedWordCount?: number;
}

interface ChapterDraftDialogProps {
  draft: ChapterDraftState;
  adopting?: boolean;
  onClose(): void;
  onAdopt(text: string): void | Promise<void>;
  onOpenChapter?(chapterId: string): void;
  onReviewChapter?(chapterId: string): void;
  onAutoWriteChapter?(chapterId: string): void;
}

export const ChapterDraftDialog = memo(function ChapterDraftDialog({
  draft,
  adopting = false,
  onClose,
  onAdopt,
  onOpenChapter,
  onReviewChapter,
  onAutoWriteChapter,
}: ChapterDraftDialogProps): JSX.Element {
  const gridClass =
    draft.candidates.length === 1
      ? "grid-cols-1"
      : draft.candidates.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";
  const committedChapterId = draft.committedChapterId ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div
        className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outline-chapter-draft-title"
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 id="outline-chapter-draft-title" className="text-base font-semibold">
            选择候选 · {draft.cardTitle}
          </h2>
          <span className="text-xs text-ink-400">{draft.candidates.length} 个候选</span>
          <button
            className="ml-auto rounded px-2 py-1 text-sm text-ink-300 transition-colors hover:bg-ink-700"
            onClick={onClose}
            aria-label="关闭候选正文"
          >
            ×
          </button>
        </div>

        {committedChapterId ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <span className="mr-auto">
              已采用为正文{typeof draft.committedWordCount === "number" ? ` · ${draft.committedWordCount} 字` : ""}
            </span>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-2.5 text-[11px] font-medium text-ink-900 transition-colors hover:bg-accent-400"
              onClick={() => onOpenChapter?.(committedChapterId)}
            >
              <BookOpenText className="h-3.5 w-3.5" />
              打开正文
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/35 px-2.5 text-[11px] text-emerald-100 transition-colors hover:bg-emerald-500/10"
              onClick={() => onAutoWriteChapter?.(committedChapterId)}
            >
              <PenLine className="h-3.5 w-3.5" />
              续写精修
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/35 px-2.5 text-[11px] text-emerald-100 transition-colors hover:bg-emerald-500/10"
              onClick={() => onReviewChapter?.(committedChapterId)}
            >
              <FileSearch className="h-3.5 w-3.5" />
              审查本章
            </button>
          </div>
        ) : null}

        <div className={`grid flex-1 gap-3 overflow-y-auto ${gridClass}`}>
          {draft.candidates.map((candidate, index) => (
            <div
              key={`${index}-${candidate.durationMs}`}
              className="flex flex-col rounded-md border border-ink-700 bg-ink-900/40"
            >
              <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-xs text-ink-400">
                <span className="font-medium text-ink-200">候选 {index + 1}</span>
                <span>{countNonWhitespace(candidate.text)} 字</span>
                <span className="ml-auto">{(candidate.durationMs / 1000).toFixed(1)}s</span>
              </div>
              <pre className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-6 text-ink-100">
                {candidate.text}
              </pre>
              <div className="flex gap-2 border-t border-ink-700 p-2">
                <button
                  className="flex-1 rounded-md bg-accent-500 px-3 py-1 text-xs font-medium text-ink-900 transition-colors hover:bg-accent-400"
                  disabled={!!committedChapterId || adopting}
                  onClick={() => onAdopt(candidate.text)}
                >
                  {committedChapterId ? "已采用" : adopting ? "采用中…" : "采用此版本"}
                </button>
                <button
                  className="rounded-md border border-ink-600 px-2 py-1 text-xs transition-colors hover:bg-ink-700"
                  onClick={() => {
                    void navigator.clipboard.writeText(candidate.text);
                  }}
                >
                  复制
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
