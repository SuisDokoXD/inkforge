import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { LLMQuickActionResponse } from "@inkforge/shared";
import { llmApi } from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";

const CONTEXT_WINDOW = 500;

interface Position {
  top: number;
  left: number;
}

interface InspirationBubbleProps {
  editor: Editor | null;
  providerId?: string | null;
  projectId?: string;
  chapterId?: string;
}

type Phase = "idle" | "loading" | "ready" | "error";

export function InspirationBubble(props: InspirationBubbleProps): JSX.Element | null {
  const { editor, providerId, projectId, chapterId } = props;
  const [anchor, setAnchor] = useState<{ pos: Position; cursor: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setAnchor(null);
    setPhase("idle");
    setOptions([]);
    setError(null);
  }, []);

  const triggerAtCursor = useCallback(async () => {
    if (!editor) return;
    if (!editor.isFocused && !editor.view.hasFocus()) return;
    const { state, view } = editor;
    const head = state.selection.head;
    const coords = view.coordsAtPos(head);
    setAnchor({ pos: { top: coords.bottom + 6, left: coords.left }, cursor: head });
    setPhase("loading");
    setOptions([]);
    setError(null);

    const start = Math.max(0, head - CONTEXT_WINDOW);
    const end = Math.min(state.doc.content.size, head + CONTEXT_WINDOW);
    const contextBefore = state.doc.textBetween(start, head, "\n", "\n");
    const contextAfter = state.doc.textBetween(head, end, "\n", "\n");

    try {
      const response: LLMQuickActionResponse = await llmApi.quick({
        kind: "inspire",
        contextBefore,
        contextAfter,
        options: 3,
        providerId: providerId ?? undefined,
        projectId,
        chapterId,
      });
      if (response.status === "failed") {
        setError(friendlyErrorMessage(response.error, "灵感生成失败，请稍后重试。"));
        setPhase("error");
        return;
      }
      setOptions(response.options ?? []);
      setPhase("ready");
    } catch (err) {
      setError(friendlyErrorMessage(err, "灵感生成失败，请稍后重试。"));
      setPhase("error");
    }
  }, [editor, providerId, projectId, chapterId]);

  useEffect(() => {
    if (!editor) return;
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const inEditor = !!target?.closest(".ProseMirror");
      if (!inEditor && !editor.isFocused) return;
      event.preventDefault();
      event.stopPropagation();
      void triggerAtCursor();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editor, triggerAtCursor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-inspiration-bubble]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [anchor, close]);

  const insert = (text: string) => {
    if (!editor || !anchor) return;
    editor
      .chain()
      .focus()
      .setTextSelection(anchor.cursor)
      .insertContent(text)
      .run();
    close();
  };

  if (!anchor) return null;
  return (
    <div
      data-inspiration-bubble
      className="fixed z-50 w-80 rounded-xl border border-ink-600 bg-ink-800/95 p-3 text-sm text-ink-100 shadow-2xl backdrop-blur"
      style={{
        top: Math.min(window.innerHeight - 260, anchor.pos.top),
        left: Math.min(window.innerWidth - 340, anchor.pos.left),
      }}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
        <span>灵感 · Ctrl+Space</span>
        <button className="rounded px-1.5 hover:bg-ink-700" onClick={close} title="关闭 (Esc)">
          ×
        </button>
      </div>
      {phase === "loading" && (
        <div className="py-6 text-center text-xs text-ink-400">思考中…</div>
      )}
      {phase === "error" && (
        <div className="py-2 text-xs text-red-400">生成失败：{error}</div>
      )}
      {phase === "ready" && options.length === 0 && (
        <div className="py-2 text-xs text-ink-400">没有生成建议，试着多写一点再呼出。</div>
      )}
      {phase === "ready" && options.length > 0 && (
        <ul className="space-y-2">
          {options.map((text, idx) => (
            <li key={idx}>
              <button
                className="block w-full rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 text-left text-[13px] leading-6 hover:border-accent-500/50 hover:bg-ink-900/70"
                onClick={() => insert(text)}
                title="点击在光标处插入"
              >
                <span className="text-ink-500 mr-2">{idx + 1}.</span>
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 border-t border-ink-700 pt-2 text-[11px] text-ink-500">
        点击插入 · Esc 关闭
      </div>
    </div>
  );
}
