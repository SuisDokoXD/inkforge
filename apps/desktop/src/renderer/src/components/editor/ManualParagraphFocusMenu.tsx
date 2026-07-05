import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, CornerDownRight, MapPin, Pilcrow, Plus, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { ManualParagraphFocusItem, ManualParagraphFocusOverview } from "../../lib/manual-paragraph-focus";
import { Badge, IconButton } from "../ui";

interface ManualParagraphFocusMenuProps {
  overview: ManualParagraphFocusOverview;
  focusMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreateBeat: (text: string) => void;
  onUseHandoff: (value: string) => void;
}

export function ManualParagraphFocusMenu({
  overview,
  focusMode,
  open: controlledOpen,
  onOpenChange,
  onCreateBeat,
  onUseHandoff,
}: ManualParagraphFocusMenuProps): JSX.Element {
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
  const current = overview.current;
  const disabled = !current;
  const tone = current?.isLong || current?.hasTodo ? "warning" : "neutral";

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
        aria-label={disabled ? "当前没有可聚焦段落" : `段落焦点，第 ${current.startLine} 行起`}
        title={disabled ? "当前没有可聚焦段落" : `段落焦点 · ${current.graphemes} 字`}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Pilcrow className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open && current ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[25rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="段落焦点"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Pilcrow className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">段落焦点</span>
                <Badge tone={tone} className="rounded px-1.5 font-normal">
                  {current.graphemes} 字
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭段落焦点"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="border-b border-ink-800 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MapPin className="h-3.5 w-3.5" />
                  第 {current.startLine}{current.endLine > current.startLine ? `-${current.endLine}` : ""} 行
                </span>
                {current.hasTodo ? <Badge tone="warning" className="rounded px-1.5 font-normal">有待补</Badge> : null}
                {current.isLong ? <Badge tone="warning" className="rounded px-1.5 font-normal">偏长</Badge> : null}
                {!current.hasTodo && !current.isLong ? <Badge tone="success" className="rounded px-1.5 font-normal">平稳</Badge> : null}
              </div>
              <div className="rounded-md border border-ink-800 bg-ink-950/35 p-2 text-sm leading-5 text-ink-100" title={current.preview}>
                {current.preview}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-ink-800 p-3">
              <NeighborBlock title="上一段" item={overview.previous} />
              <NeighborBlock title="下一段" item={overview.next} />
            </div>

            {(current.hasTodo || current.isLong) ? (
              <div className="flex items-start gap-2 border-b border-ink-800 px-3 py-2 text-[11px] text-amber-100/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1">
                  {current.hasTodo && current.isLong
                    ? "本段有待补且偏长，适合拆成接力任务后继续。"
                    : current.hasTodo
                      ? "本段有待补，适合先放进接力队列。"
                      : "本段偏长，继续写之前可以先收束这一段。"}
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 p-3">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                onClick={() => onUseHandoff(overview.handoffNote)}
                disabled={!overview.handoffNote}
                aria-label="把本段整理为收工备注"
                title="整理为收工备注"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                收工
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-500/15 px-2.5 text-accent-100 hover:bg-accent-500/25 disabled:opacity-40"
                onClick={() => onCreateBeat(overview.beatText)}
                disabled={!overview.beatText}
                aria-label={`加入接力：${overview.beatText}`}
                title="加入接力"
              >
                <Plus className="h-3.5 w-3.5" />
                接力
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NeighborBlock({ title, item }: { title: string; item: ManualParagraphFocusItem | null }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border border-ink-800 bg-ink-950/30 px-2 py-2">
      <div className="mb-1 text-[10px] text-ink-500">{title}</div>
      {item ? (
        <>
          <div className="truncate text-ink-100" title={item.preview}>{item.preview}</div>
          <div className="mt-1 text-[10px] tabular-nums text-ink-500">第 {item.startLine} 行 · {item.graphemes} 字</div>
        </>
      ) : (
        <div className="truncate text-ink-500">暂无</div>
      )}
    </div>
  );
}