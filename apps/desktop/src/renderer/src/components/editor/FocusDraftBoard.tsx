import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Minus, NotepadText, X } from "lucide-react";

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
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [position, setPosition] = useState<DraftPosition>({ x: 32, y: 96 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setText(window.localStorage.getItem(contentKey) ?? "");
  }, [contentKey]);

  useEffect(() => {
    const raw = window.localStorage.getItem(posKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<DraftPosition>;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        setPosition({
          x: Math.max(8, Math.min(parsed.x, window.innerWidth - 280)),
          y: Math.max(56, Math.min(parsed.y, window.innerHeight - 160)),
        });
      }
    } catch {
      // Ignore corrupted local UI state.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(contentKey, text);
  }, [contentKey, text]);

  useEffect(() => {
    window.localStorage.setItem(posKey, JSON.stringify(position));
  }, [posKey, position]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const nextX = drag.originX + event.clientX - drag.startX;
      const nextY = drag.originY + event.clientY - drag.startY;
      setPosition({
        x: Math.max(8, Math.min(nextX, window.innerWidth - 288)),
        y: Math.max(56, Math.min(nextY, window.innerHeight - 96)),
      });
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-30 flex h-9 items-center gap-2 rounded-md border border-ink-700 bg-ink-900/90 px-3 text-xs text-ink-200 shadow-xl backdrop-blur hover:border-accent-500/50 hover:text-accent-100"
        style={{ left: position.x, top: position.y }}
      >
        <NotepadText className="h-4 w-4 text-accent-300" />
        草稿
      </button>
    );
  }

  return (
    <div
      className="fixed z-30 w-80 overflow-hidden rounded-lg border border-ink-700 bg-ink-900/92 text-ink-100 shadow-2xl backdrop-blur"
      style={{ left: position.x, top: position.y }}
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
            <span className="rounded bg-ink-950 px-1.5 py-0.5 text-[10px] text-ink-500">
              {text.trim().length} 字
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            title={collapsed ? "展开" : "收起"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            title="隐藏草稿栏"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-2.5">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="临时记一下下一段想写什么、人物动机、伏笔、句子碎片..."
            className="h-48 w-full resize-y rounded-md border border-ink-700 bg-ink-950/85 p-2.5 text-sm leading-6 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/60"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
            <span>只在专注模式显示，按当前章节保存。</span>
            {text && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("清空这张草稿栏？")) setText("");
                }}
                className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-800 hover:text-rose-200"
              >
                清空
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
