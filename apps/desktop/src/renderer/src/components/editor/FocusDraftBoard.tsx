import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Minus, NotepadText, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR, EASE_IN_OUT, EASE_STANDARD, fadeOnly, hoverLift, SPRING_SNAPPY, tapPress } from "../../lib/motion-tokens";
import { Badge } from "../ui";

interface DraftPosition {
  x: number;
  y: number;
}

export function FocusDraftBoard({
  chapterId,
  projectId,
}: {
  chapterId: string;
  projectId: string;
}): JSX.Element {
  const contentKey = `inkforge:focus-draft:${projectId}:${chapterId}`;
  const posKey = "inkforge:focus-draft:position";
  const reduceMotion = useReducedMotion() === true;
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [position, setPosition] = useState<DraftPosition>({ x: 32, y: 96 });
  const positionRef = useRef<DraftPosition>(position);
  const pendingPositionRef = useRef<DraftPosition | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const panelMotion = reduceMotion
    ? fadeOnly
    : {
        initial: { opacity: 0, scale: 0.96, y: 6 },
        animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_SNAPPY },
        exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
      };
  const collapseMotion = reduceMotion
    ? fadeOnly
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto", transition: { duration: DUR.base, ease: EASE_IN_OUT } },
        exit: { opacity: 0, height: 0, transition: { duration: DUR.fast, ease: EASE_IN_OUT } },
      };
  const buttonMotion = reduceMotion ? {} : { whileHover: hoverLift, whileTap: tapPress, transition: SPRING_SNAPPY };

  const clampPosition = (next: DraftPosition): DraftPosition => ({
    x: Math.max(8, Math.min(next.x, window.innerWidth - 288)),
    y: Math.max(56, Math.min(next.y, window.innerHeight - 96)),
  });

  useEffect(() => {
    setText(window.localStorage.getItem(contentKey) ?? "");
    setConfirmClear(false);
  }, [contentKey]);

  useEffect(() => {
    if (collapsed) setConfirmClear(false);
  }, [collapsed]);

  useEffect(() => {
    const raw = window.localStorage.getItem(posKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<DraftPosition>;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        setPosition(clampPosition({ x: parsed.x, y: parsed.y }));
      }
    } catch {
      // Ignore corrupted local UI state.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(contentKey, text);
  }, [contentKey, text]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const flushPendingPosition = () => {
      frameRef.current = null;
      const pending = pendingPositionRef.current;
      if (!pending) return;
      pendingPositionRef.current = null;
      positionRef.current = pending;
      setPosition(pending);
    };
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      pendingPositionRef.current = clampPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flushPendingPosition);
      }
    };
    const handleUp = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        flushPendingPosition();
      }
      window.localStorage.setItem(posKey, JSON.stringify(positionRef.current));
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [posKey]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  if (!open) {
    return (
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-30 flex h-9 items-center gap-2 rounded-md border border-ink-700 bg-ink-900/90 px-3 text-xs text-ink-200 shadow-xl backdrop-blur hover:border-accent-500/50 hover:text-accent-100"
        style={{ left: position.x, top: position.y }}
        aria-label="打开专注草稿"
        {...panelMotion}
        {...buttonMotion}
      >
        <NotepadText className="h-4 w-4 text-accent-300" />
        草稿
      </motion.button>
    );
  }

  return (
    <motion.div
      className="fixed z-30 w-80 overflow-hidden rounded-lg border border-ink-700 bg-ink-900/92 text-ink-100 shadow-2xl backdrop-blur"
      style={{ left: position.x, top: position.y }}
      {...panelMotion}
    >
      <div
        className="flex cursor-move items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/80 px-2.5 py-2"
        onPointerDown={startDrag}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-ink-500" />
          <NotepadText className="h-4 w-4 shrink-0 text-accent-300" />
          <span className="truncate text-sm font-medium">专注草稿</span>
          {text.trim() && (
            <Badge
              tone="neutral"
              className="rounded bg-ink-950 px-1.5 font-normal text-ink-500 ring-ink-700/60"
            >
              {text.trim().length} 字
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            title={collapsed ? "展开" : "收起"}
            aria-label={collapsed ? "展开草稿栏" : "收起草稿栏"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            title="隐藏草稿栏"
            aria-label="隐藏草稿栏"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div className="overflow-hidden" {...collapseMotion}>
            <div className="p-2.5">
              <textarea
                aria-label="专注草稿内容"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="临时记一下下一段想写什么、人物动机、伏笔、句子碎片..."
                className="h-48 w-full resize-y rounded-md border border-ink-700 bg-ink-950/85 p-2.5 text-sm leading-6 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/60"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
                <span>只在专注模式显示，按当前章节保存。</span>
                {text && (
                  <AnimatePresence initial={false} mode="wait">
                    {confirmClear ? (
                      <motion.div
                        key="clear-confirm"
                        variants={fadeOnly}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setText("");
                            setConfirmClear(false);
                          }}
                          className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-100 hover:bg-rose-500/20"
                        >
                          确认清空
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="clear-start"
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-800 hover:text-rose-200"
                        {...buttonMotion}
                      >
                        清空
                      </motion.button>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
