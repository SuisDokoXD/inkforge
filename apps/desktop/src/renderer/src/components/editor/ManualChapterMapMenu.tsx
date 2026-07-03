import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText, Heading1, ListTree, Minus, Pilcrow, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import {
  currentManualChapterMapItem,
  filterManualChapterMapItems,
  type ManualChapterMapFilter,
  type ManualChapterMapItem,
  type ManualChapterMapItemKind,
} from "../../lib/manual-chapter-map";
import { Badge, IconButton } from "../ui";

interface ManualChapterMapMenuProps {
  items: ManualChapterMapItem[];
  currentLine: number;
  focusMode: boolean;
  onJumpItem: (item: ManualChapterMapItem) => boolean;
}

const FILTERS: Array<{ key: ManualChapterMapFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "heading", label: "标题" },
  { key: "scene", label: "场景" },
  { key: "todo", label: "待补" },
];

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

export function ManualChapterMapMenu({
  items,
  currentLine,
  focusMode,
  onJumpItem,
}: ManualChapterMapMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ManualChapterMapFilter>("all");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const activeItem = useMemo(() => currentManualChapterMapItem(items, currentLine), [currentLine, items]);
  const visibleItems = useMemo(() => filterManualChapterMapItems(items, filter), [filter, items]);
  const counts = useMemo<Record<ManualChapterMapFilter, number>>(() => ({
    all: items.length,
    heading: items.filter((item) => item.kind === "heading").length,
    scene: items.filter((item) => item.kind === "scene").length,
    todo: items.filter((item) => item.kind === "todo").length,
  }), [items]);
  const disabled = items.length === 0;

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
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label={disabled ? "当前章节暂无导航标记" : `章节导航，共 ${items.length} 处`}
        title={disabled ? "当前章节暂无导航标记" : `章节导航 · ${items.length} 处`}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <ListTree className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="章节导航"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">章节导航</span>
                <Badge tone="neutral" className="rounded bg-ink-950 px-1.5 font-normal text-ink-400 ring-ink-700/60">
                  {items.length}
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭章节导航"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-ink-700 px-2 py-2" role="tablist" aria-label="章节导航筛选">
              {FILTERS.map((item) => {
                const selected = filter === item.key;
                const count = counts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${
                      selected
                        ? "border-accent-500/40 bg-accent-500/15 text-accent-100"
                        : "border-ink-700 bg-ink-950/25 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    }`}
                    onClick={() => setFilter(item.key)}
                  >
                    <span>{item.label}</span>
                    <span className="tabular-nums text-ink-500">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
              {visibleItems.length > 0 ? (
                visibleItems.map((item) => {
                  const active = activeItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left ${
                        active
                          ? "bg-accent-500/12 text-accent-100"
                          : "text-ink-200 hover:bg-ink-800 hover:text-ink-100"
                      }`}
                      onClick={() => {
                        if (onJumpItem(item)) setOpen(false);
                      }}
                      title={`第 ${item.line} 行 · ${item.label}`}
                    >
                      <span className={`shrink-0 ${active ? "text-accent-200" : "text-ink-500"}`}>
                        {itemIcon(item.kind)}
                      </span>
                      <span className="w-8 shrink-0 text-[10px] tabular-nums text-ink-500">{item.line}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 rounded bg-ink-950/50 px-1.5 py-0.5 text-[10px] text-ink-500">
                        {itemKindLabel(item.kind)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-ink-500">
                  当前筛选没有标记
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
