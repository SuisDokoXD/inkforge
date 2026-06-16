import { memo } from "react";
import type { ChapterRecord, OutlineCardRecord } from "@inkforge/shared";
import {
  BookOpenText,
  CheckCircle2,
  FileSearch,
  Loader2,
  PenLine,
  RotateCcw,
} from "lucide-react";
import { getCardQuality, parseOutlineSections } from "./outline-metrics";

interface OutlineCardItemProps {
  card: OutlineCardRecord;
  busy: string | null;
  linkedChapter?: ChapterRecord | null;
  highlighted?: boolean;
  refineIntent: string;
  canUndo: boolean;
  onAutoWriteOutlineCard(card: OutlineCardRecord): void;
  onRefine(card: OutlineCardRecord): void;
  onUndo(card: OutlineCardRecord): void;
  onRefineIntentChange(cardId: string, value: string): void;
  onOpenChapter?(chapterId: string): void;
  onReviewChapter?(chapterId: string): void;
  onAutoWriteChapter?(chapterId: string): void;
}

export const OutlineCardItem = memo(function OutlineCardItem({
  card,
  busy,
  linkedChapter,
  highlighted = false,
  refineIntent,
  canUndo,
  onAutoWriteOutlineCard,
  onRefine,
  onUndo,
  onRefineIntentChange,
  onOpenChapter,
  onReviewChapter,
  onAutoWriteChapter,
}: OutlineCardItemProps): JSX.Element {
  const quality = getCardQuality(card);
  const isPreparing = busy === `prepare-chapter-${card.id}`;
  const isRefining = busy === `refine-card-${card.id}`;
  const disabled = busy !== null;
  const hasLinkedChapter = !!linkedChapter;
  const hasWrittenText = (linkedChapter?.wordCount ?? 0) > 0;

  return (
    <div
      className={`rounded-md border bg-ink-800/25 p-3 shadow-sm transition ${
        highlighted
          ? "border-accent-500/70 ring-2 ring-accent-500/35"
          : "border-ink-700"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{card.title}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1 ${quality.cls}`}>
          {quality.label} · {quality.score}/10
        </span>
        {card.chapterId ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1 ${
              hasWrittenText
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25"
                : "bg-amber-500/15 text-amber-300 ring-amber-500/25"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {hasWrittenText ? "已写" : hasLinkedChapter ? "待写" : "章节缺失"}
          </span>
        ) : null}
        {!hasLinkedChapter ? (
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent-500 px-2.5 py-1 text-[11px] font-medium text-ink-900 transition-colors hover:bg-accent-400 disabled:opacity-50"
            disabled={disabled}
            onClick={() => onAutoWriteOutlineCard(card)}
          >
            {isPreparing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PenLine className="h-3.5 w-3.5" />
            )}
            {isPreparing ? "准备中" : "去 AI 写作"}
          </button>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
        {hasLinkedChapter ? (
          <>
            <span>正文 {linkedChapter.wordCount} 字</span>
            <span>·</span>
            <span className="max-w-56 truncate" title={linkedChapter.title}>
              关联《{linkedChapter.title || "未命名章节"}》
            </span>
          </>
        ) : (
          <span>{card.chapterId ? "关联章节不可用，请检查章节列表。" : "尚未写正文"}</span>
        )}
      </div>

      {hasLinkedChapter ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-2.5 text-[11px] font-medium text-ink-900 transition-colors hover:bg-accent-400"
            onClick={() => onOpenChapter?.(linkedChapter.id)}
          >
            <BookOpenText className="h-3.5 w-3.5" />
            打开正文
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-500/45 px-2.5 text-[11px] text-accent-200 transition-colors hover:bg-accent-500/10 disabled:opacity-50"
            onClick={() => onAutoWriteChapter?.(linkedChapter.id)}
          >
            <PenLine className="h-3.5 w-3.5" />
            进入 AI 写作
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-[11px] text-ink-200 transition-colors hover:bg-ink-700"
            onClick={() => onReviewChapter?.(linkedChapter.id)}
          >
            <FileSearch className="h-3.5 w-3.5" />
            审查本章
          </button>
        </div>
      ) : null}

      <OutlineCardBody content={card.content} />

      {!hasLinkedChapter ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            aria-label={`优化章节大纲：${card.title}`}
            className="h-8 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-500 focus:border-accent-500/70 focus:outline-none"
            placeholder="优化此章：增强紧迫感 / 增加景物细节 / 改成散文小节"
            value={refineIntent}
            onChange={(event) => onRefineIntentChange(card.id, event.target.value)}
          />
          <button
            className="inline-flex h-8 items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-[11px] transition-colors hover:bg-ink-700 disabled:opacity-50"
            disabled={disabled || !refineIntent.trim()}
            onClick={() => onRefine(card)}
          >
            {isRefining ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PenLine className="h-3.5 w-3.5" />
            )}
            {isRefining ? "优化中" : "优化"}
          </button>
          {canUndo ? (
            <button
              className="inline-flex h-8 items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-[11px] transition-colors hover:bg-ink-700"
              onClick={() => onUndo(card)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              撤销
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function OutlineCardBody({ content }: { content: string }): JSX.Element {
  const sections = parseOutlineSections(content);
  if (sections.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-xs leading-6 text-ink-400">
        {content || "（空）"}
      </p>
    );
  }

  return (
    <div className="divide-y divide-ink-700/70 border-y border-ink-700/70">
      {sections.map((section) => (
        <div
          key={section.label}
          className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2 text-xs leading-6"
        >
          <div className="text-[11px] font-medium text-accent-300">{section.label}</div>
          <div className="whitespace-pre-wrap text-ink-300">{section.body}</div>
        </div>
      ))}
    </div>
  );
}
