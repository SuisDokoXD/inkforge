import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { LLMQuickActionResponse } from "@inkforge/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { llmApi } from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../lib/motion-tokens";
import { MotionSpinner } from "./MotionSpinner";

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
  const reduceMotion = useReducedMotion() === true;
  const [anchor, setAnchor] = useState<{ pos: Position; cursor: number } | null>(null);
  const [lastAnchor, setLastAnchor] = useState<{ pos: Position; cursor: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
      };

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
    if (anchor) setLastAnchor(anchor);
  }, [anchor]);

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

  const panelAnchor = anchor ?? lastAnchor;
  if (!panelAnchor) return null;
  const panelTop = Math.max(
    12,
    Math.min(window.innerHeight - 260, panelAnchor.pos.top),
  );
  const panelLeft = Math.max(
    12,
    Math.min(window.innerWidth - 340, panelAnchor.pos.left),
  );

  return (
    <AnimatePresence initial={false} onExitComplete={() => setLastAnchor(null)}>
      {anchor ? (
        <motion.div
          data-inspiration-bubble
          role="dialog"
          aria-label="灵感建议"
          className="fixed z-50 w-80 rounded-xl border border-ink-600 bg-ink-800/95 p-3 text-sm text-ink-100 shadow-2xl backdrop-blur"
          variants={panelMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{
            top: panelTop,
            left: panelLeft,
          }}
        >
          <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
            <span>灵感 · Ctrl+Space</span>
            <motion.button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-ink-700"
              onClick={close}
              aria-label="关闭灵感建议"
              title="关闭 (Esc)"
              {...buttonMotion}
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </motion.button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {phase === "loading" && (
              <motion.div
                key="loading"
                role="status"
                className="flex items-center justify-center gap-2 py-6 text-xs text-ink-400"
                variants={panelMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <MotionSpinner className="h-3.5 w-3.5" />
                思考中…
              </motion.div>
            )}
            {phase === "error" && (
              <motion.div
                key="error"
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300"
                variants={panelMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                生成失败：{error}
              </motion.div>
            )}
            {phase === "ready" && options.length === 0 && (
              <motion.div
                key="empty"
                className="rounded-md border border-ink-700 bg-ink-900/50 px-3 py-2 text-xs leading-5 text-ink-400"
                variants={panelMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                没有生成建议，试着多写一点再呼出。
              </motion.div>
            )}
            {phase === "ready" && options.length > 0 && (
              <motion.ul
                key="options"
                className="space-y-2"
                variants={reduceMotion ? undefined : staggerContainer}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {options.map((text, idx) => (
                  <motion.li
                    key={`${idx}-${text}`}
                    variants={reduceMotion ? fadeOnly : staggerItem}
                  >
                    <motion.button
                      type="button"
                      className="block w-full rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 text-left text-[13px] leading-6 hover:border-accent-500/50 hover:bg-ink-900/70"
                      onClick={() => insert(text)}
                      title="点击在光标处插入"
                      {...buttonMotion}
                    >
                      <span className="mr-2 text-ink-500">{idx + 1}.</span>
                      {text}
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <div className="mt-2 border-t border-ink-700 pt-2 text-[11px] text-ink-500">
            点击插入 · Esc 关闭
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
