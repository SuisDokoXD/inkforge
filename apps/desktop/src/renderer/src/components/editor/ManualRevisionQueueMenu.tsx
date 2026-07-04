import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ClipboardCheck, CornerDownRight, MapPin, Plus, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { ManualRevisionQueueItem } from "../../lib/manual-revision-queue";
import { Badge, IconButton } from "../ui";

interface ManualRevisionQueueMenuProps {
  items: ManualRevisionQueueItem[];
  focusMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onJumpItem: (item: ManualRevisionQueueItem) => void;
  onResolveItem: (item: ManualRevisionQueueItem) => void;
  onCreateBeat: (item: ManualRevisionQueueItem) => void;
}

export function ManualRevisionQueueMenu({
  items,
  focusMode,
  open: controlledOpen,
  onOpenChange,
  onJumpItem,
  onResolveItem,
  onCreateBeat,
}: ManualRevisionQueueMenuProps): JSX.Element {
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
  }, [open, setOpen]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, setOpen]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label={disabled ? "当前章节暂无待补" : `修订队列，共 ${items.length} 条待补`}
        title={disabled ? "当前章节暂无待补" : `修订队列 · ${items.length} 条`}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <ClipboardCheck className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="修订队列"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">修订队列</span>
                <Badge tone="accent" className="rounded px-1.5 font-normal">
                  {items.length}
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭修订队列"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto py-1 scrollbar-thin">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-ink-800 px-3 py-2 last:border-b-0 hover:bg-ink-800/45"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 w-8 shrink-0 text-[10px] tabular-nums text-ink-500">
                      {item.line}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink-100" title={item.title}>
                        {item.title}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-ink-500" title={item.preview}>
                        {item.preview}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 pl-10">
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ink-300 hover:bg-ink-700 hover:text-ink-100"
                      onClick={() => onJumpItem(item)}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      跳转
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ink-300 hover:bg-ink-700 hover:text-accent-100"
                      onClick={() => onCreateBeat(item)}
                    >
                      <CornerDownRight className="h-3.5 w-3.5" />
                      接力
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500/12 px-2 text-emerald-100 hover:bg-emerald-500/20"
                      onClick={() => onResolveItem(item)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      完成
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-ink-800 px-3 py-2 text-[11px] text-ink-500">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">完成会删除正文里的待补标记，正文内容保留。</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
