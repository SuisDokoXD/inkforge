import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, GitBranch, Heading1, MapPin, Minus, Pilcrow, Plus, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { ManualChapterMapItem, ManualChapterMapItemKind } from "../../lib/manual-chapter-map";
import type { ManualChapterStructureOverview, ManualChapterStructureSuggestion } from "../../lib/manual-chapter-structure";
import { Badge, IconButton } from "../ui";

interface ManualChapterStructureMenuProps {
  overview: ManualChapterStructureOverview;
  focusMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onJumpItem: (item: ManualChapterMapItem) => boolean;
  onCreateBeat: (text: string) => void;
}

function itemIcon(kind: ManualChapterMapItemKind): JSX.Element {
  if (kind === "heading") return <Heading1 className="h-3.5 w-3.5" />;
  if (kind === "scene") return <Minus className="h-3.5 w-3.5" />;
  return <Pilcrow className="h-3.5 w-3.5" />;
}

function itemKindLabel(kind: ManualChapterMapItemKind): string {
  if (kind === "heading") return "标题";
  if (kind === "scene") return "场景";
  return "待补";
}

export function ManualChapterStructureMenu({
  overview,
  focusMode,
  open: controlledOpen,
  onOpenChange,
  onJumpItem,
  onCreateBeat,
}: ManualChapterStructureMenuProps): JSX.Element {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback((nextOpen: boolean | ((value: boolean) => boolean)) => {
    const resolvedOpen = typeof nextOpen === "function" ? nextOpen(controlledOpen ?? localOpen) : nextOpen;
    if (controlledOpen === undefined) setLocalOpen(resolvedOpen);
    onOpenChange?.(resolvedOpen);
  }, [controlledOpen, localOpen, onOpenChange]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const disabled = overview.counts.total === 0;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, setOpen]);

  const jump = (item: ManualChapterMapItem | null) => {
    if (!item) return;
    if (onJumpItem(item)) setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label={disabled ? "当前章节暂无结构标记" : `章节结构，共 ${overview.counts.total} 处标记`}
        title={disabled ? "当前章节暂无结构标记" : `章节结构 · ${overview.counts.total} 处`}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <GitBranch className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[25rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="章节结构"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <GitBranch className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">章节结构</span>
                <Badge tone="neutral" className="rounded bg-ink-950 px-1.5 font-normal text-ink-400 ring-ink-700/60">
                  {overview.counts.total}
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭章节结构"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-ink-800 p-3">
              <Metric label="标题" value={overview.counts.headings} />
              <Metric label="场景" value={overview.counts.scenes} />
              <Metric label="待补" value={overview.counts.todos} />
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-ink-800 p-3">
              <AnchorBlock title="当前位置" item={overview.currentItem} onJump={() => jump(overview.currentItem)} />
              <AnchorBlock title="下一处" item={overview.nextItem} onJump={() => jump(overview.nextItem)} />
            </div>

            <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
              {overview.suggestions.length > 0 ? (
                overview.suggestions.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.id}
                    suggestion={suggestion}
                    onJump={() => jump(suggestion.item)}
                    onCreateBeat={() => onCreateBeat(suggestion.beatText)}
                  />
                ))
              ) : (
                <div className="flex items-center gap-2 px-3 py-6 text-ink-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>当前没有可加入接力的结构建议。</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/35 px-2 py-1.5">
      <div className="text-[10px] text-ink-500">{label}</div>
      <div className="mt-0.5 tabular-nums text-ink-100">{value}</div>
    </div>
  );
}

function AnchorBlock({ title, item, onJump }: { title: string; item: ManualChapterMapItem | null; onJump: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="min-w-0 rounded-md border border-ink-800 bg-ink-950/30 px-2 py-2 text-left hover:bg-ink-800/60 disabled:hover:bg-ink-950/30"
      onClick={onJump}
      disabled={!item}
      title={item ? `第 ${item.line} 行 · ${item.label}` : title}
    >
      <div className="mb-1 text-[10px] text-ink-500">{title}</div>
      {item ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-ink-500">{itemIcon(item.kind)}</span>
          <span className="min-w-0 flex-1 truncate text-ink-100">{item.label}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-ink-500">{item.line}</span>
        </div>
      ) : (
        <div className="truncate text-ink-500">暂无</div>
      )}
    </button>
  );
}

function SuggestionRow({
  suggestion,
  onJump,
  onCreateBeat,
}: {
  suggestion: ManualChapterStructureSuggestion;
  onJump: () => void;
  onCreateBeat: () => void;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-ink-800 px-3 py-2 last:border-b-0 hover:bg-ink-800/45">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink-100" title={suggestion.label}>{suggestion.label}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-500">
          {suggestion.item ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              {itemIcon(suggestion.item.kind)}
              <span className="truncate">{itemKindLabel(suggestion.item.kind)}</span>
            </span>
          ) : null}
          <span className="shrink-0">{suggestion.detail}</span>
        </div>
      </div>
      {suggestion.item ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-ink-300 hover:bg-ink-700 hover:text-ink-100"
          onClick={onJump}
          aria-label={`跳到${suggestion.label}`}
          title="跳转"
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent-500/15 px-2 text-accent-100 hover:bg-accent-500/25"
        onClick={onCreateBeat}
        aria-label={`加入接力：${suggestion.beatText}`}
        title="加入接力"
      >
        <Plus className="h-3.5 w-3.5" />
        接力
      </button>
    </div>
  );
}