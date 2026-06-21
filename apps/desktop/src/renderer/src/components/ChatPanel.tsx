import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Trash2 } from "lucide-react";
import type { LLMChatMessage } from "@inkforge/shared";
import { chapterApi, llmApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  staggerContainer,
  staggerItem,
} from "../lib/motion-tokens";
import { Button, Textarea } from "./ui";

type DisplayMessage = LLMChatMessage & {
  id: string;
  status?: "pending" | "failed";
  error?: string;
};

const STORAGE_PREFIX = "inkforge.chat.history.";
const MAX_SAVED = 60;

function loadHistory(key: string): DisplayMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DisplayMessage[];
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(key: string, messages: DisplayMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_SAVED);
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

function clearHistory(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

function sliceExcerpt(text: string, max = 1200): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(-max);
}

export function ChatPanel(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const activeProviderId = useAppStore((s) => s.settings.activeProviderId);

  const historyKey = currentProjectId
    ? `${currentProjectId}:${currentChapterId ?? "none"}`
    : "none";
  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadHistory(historyKey));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [attachExcerpt, setAttachExcerpt] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const messageMotion = reduceMotion ? fadeOnly : staggerItem;
  useEffect(() => {
    setMessages(loadHistory(historyKey));
    setConfirmClear(false);
  }, [historyKey]);

  useEffect(() => {
    if (messages.length === 0) setConfirmClear(false);
  }, [messages.length]);

  useEffect(() => {
    saveHistory(historyKey, messages);
  }, [historyKey, messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const chapterContentQuery = useQuery({
    queryKey: ["chapter-content", currentChapterId],
    queryFn: () =>
      currentChapterId ? chapterApi.read({ id: currentChapterId }) : Promise.resolve(null),
    enabled: !!currentChapterId,
  });

  const chapterExcerpt = useMemo(() => {
    if (!attachExcerpt) return undefined;
    const text = chapterContentQuery.data?.content ?? "";
    if (!text.trim()) return undefined;
    return sliceExcerpt(text, 1200);
  }, [attachExcerpt, chapterContentQuery.data?.content]);

  const canSend = !!input.trim() && !pending;

  const submit = async (): Promise<void> => {
    const text = input.trim();
    if (!text || pending) return;
    const userMsg: DisplayMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setConfirmClear(false);
    setPending(true);
    try {
      const payload = next.map<LLMChatMessage>((m) => ({ role: m.role, content: m.content }));
      const response = await llmApi.chat({
        messages: payload,
        providerId: activeProviderId ?? undefined,
        projectId: currentProjectId ?? undefined,
        chapterId: currentChapterId ?? undefined,
        chapterExcerpt,
      });
      if (response.status === "completed" && response.text) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${response.messageId}`, role: "assistant", content: response.text! },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${response.messageId}`,
            role: "assistant",
            content: "",
            status: "failed",
            error: friendlyErrorMessage(response.error, "助手暂时无法回复，请稍后重试。"),
          },
        ]);
      }
    } catch (error) {
      const message = friendlyErrorMessage(error, "助手暂时无法回复，请稍后重试。");
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: "assistant",
          content: "",
          status: "failed",
          error: message,
        },
      ]);
    } finally {
      setPending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const clear = (): void => {
    if (pending) return;
    setMessages([]);
    clearHistory(historyKey);
    setConfirmClear(false);
    textareaRef.current?.focus();
  };
  const canClear = messages.length > 0 && !pending;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2 text-xs text-ink-300">
        <label className="flex items-center gap-2" htmlFor="chat-attach-excerpt">
          <input
            id="chat-attach-excerpt"
            type="checkbox"
            className="h-3 w-3 accent-accent-500"
            checked={attachExcerpt}
            onChange={(e) => setAttachExcerpt(e.target.checked)}
          />
          <span>附带当前章节片段</span>
        </label>
        <AnimatePresence initial={false} mode="wait">
          {confirmClear ? (
            <motion.div
              id="chat-clear-confirm"
              key="clear-confirm"
              className="flex shrink-0 items-center gap-1"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              role="group"
              aria-label="确认清空当前对话"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={clear}
                disabled={pending}
              >
                确认清空
              </Button>
            </motion.div>
          ) : (
            <Button
              key="clear-start"
              type="button"
              className="shrink-0"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={!canClear}
              title={pending ? "等待回复完成后再清空" : "清空当前对话"}
              aria-label="清空当前对话"
              aria-expanded={confirmClear}
              aria-controls="chat-clear-confirm"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              清空
            </Button>
          )}
        </AnimatePresence>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-auto scrollbar-thin px-3 py-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <AnimatePresence initial={false} mode="wait">
          {messages.length === 0 && (
            <motion.p
              key="chat-empty"
              className="text-xs text-ink-400"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              问写作、问情节、问人物都可以。回答默认不超过 200 字。按 Enter 发送，Shift+Enter 换行。
            </motion.p>
          )}
        </AnimatePresence>
        <motion.div
          className="space-y-2"
          variants={reduceMotion ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`rounded-lg border px-3 py-2 text-[13px] leading-6 ${
                  msg.role === "user"
                    ? "border-accent-500/30 bg-accent-500/10 text-accent-100"
                    : msg.status === "failed"
                      ? "border-red-500/40 bg-red-500/10 text-red-200"
                      : "border-ink-700 bg-ink-800/60 text-ink-100"
                }`}
                variants={messageMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-400">
                  <span>{msg.role === "user" ? "我" : "助手"}</span>
                </div>
                {msg.status === "failed" ? (
                  <div role="alert">失败：{msg.error}</div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence initial={false}>
          {pending && (
            <motion.div
              className="rounded-lg border border-ink-700 bg-ink-800/40 px-3 py-2 text-[13px] text-ink-400"
              role="status"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              助手思考中…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="border-t border-ink-700 bg-ink-800/40 px-3 py-2">
        <label htmlFor="chat-panel-input" className="sr-only">
          向写作助手提问
        </label>
        <Textarea
          id="chat-panel-input"
          ref={textareaRef}
          className="min-h-[56px] rounded-md bg-ink-900 px-2 py-1.5 text-[13px]"
          placeholder={pending ? "生成中…" : "问点什么，比如：这段怎么改更紧凑？"}
          value={input}
          disabled={pending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          aria-describedby="chat-panel-input-hint"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-500">
          <span id="chat-panel-input-hint">Enter 发送 · Shift+Enter 换行</span>
          <Button
            type="button"
            className="border-accent-500/40 bg-accent-500/20 px-3 py-0.5 text-accent-200 hover:bg-accent-500/30"
            variant="accentSoft"
            size="sm"
            onClick={() => void submit()}
            disabled={!canSend}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
