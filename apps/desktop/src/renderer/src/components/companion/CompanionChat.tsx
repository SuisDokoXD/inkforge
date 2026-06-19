import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { LLMChatMessage } from "@inkforge/shared";
import { llmApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { MotionPulse } from "../MotionSpinner";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";
import {
  applyPersona,
  PET_DEFAULT_NAME,
  PET_LABEL,
} from "./companion-persona";

interface CompanionChatProps {
  open: boolean;
  petName: string;
  /** 精灵中心屏幕坐标 */
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

interface ChatMsg extends LLMChatMessage {
  id: string;
}

const CHAT_PANEL_W = 320;
const CHAT_PANEL_H = 420;
const GAP = 18;

/**
 * 桌宠 AI 聊天面板。
 *
 * 设计特点：
 *   - portal 到 body，永远在最上层
 *   - 自动选择"精灵左侧 / 右侧"展示，避免越界
 *   - 复用现有 llmApi.chat，传入桌宠 persona system prompt
 *   - 不持久化历史（只活在本次对话生命周期，关闭即失忆）
 *   - 200~400 字短回复，带宠物口吻
 */
export function CompanionChat({
  open,
  petName,
  anchorX,
  anchorY,
  onClose,
}: CompanionChatProps): JSX.Element | null {
  const reduce = useReducedMotion() === true;
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: "greeting",
      role: "assistant",
      content: applyPersona(
        "{sound}~ {self}是 {name}，有什么想聊的吗？",
        petName,
      ),
    },
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sendMut = useMutation({
    mutationFn: (text: string) =>
      llmApi.chat({
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: text },
        ],
        systemPrompt: buildSystemPrompt(petName),
        temperature: 0.85,
        maxTokens: 380,
      }),
    onSuccess: (resp, text) => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: text },
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: resp.text ?? "（{sound}…{self}没听清）".replace("{sound}", "啊").replace("{self}", "我"),
        },
      ]);
      setInput("");
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
      });
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `…暂时没回上来：${friendlyErrorMessage(err, "模型服务暂时不可用，请稍后重试。")}`,
        },
      ]);
    },
  });

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 自适应位置：默认精灵左侧；左侧不够则右侧；上下居中且贴近视窗
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const margin = 16;
  let left = anchorX - GAP - CHAT_PANEL_W;
  if (left < margin) left = anchorX + GAP + 32; // 32 ≈ 精灵半径
  if (left + CHAT_PANEL_W > vw - margin) left = vw - margin - CHAT_PANEL_W;
  let top = anchorY - CHAT_PANEL_H / 2;
  if (top < margin) top = margin;
  if (top + CHAT_PANEL_H > vh - margin) top = vh - margin - CHAT_PANEL_H;

  const display = (raw: string): string => applyPersona(raw, petName);

  const handleSend = (): void => {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    sendMut.mutate(text);
  };

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="pointer-events-auto fixed z-[9998] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-md"
          variants={reduce ? fadeOnly : fadeSlideUp}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{
            left: `${left}px`,
            top: `${top}px`,
            width: `${CHAT_PANEL_W}px`,
            height: `${CHAT_PANEL_H}px`,
          }}
        >
          {/* 顶栏 */}
          <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-b from-ink-800/80 to-ink-900/80 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden>
                🐾
              </span>
              <div>
                <div className="text-[12.5px] font-semibold text-ink-100">
                  {petName || PET_DEFAULT_NAME}
                </div>
                <div className="text-[10px] text-emerald-300/80">在线</div>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-400 hover:bg-ink-700/60 hover:text-ink-100"
              aria-label="关闭聊天"
              whileHover={reduce ? undefined : hoverLift}
              whileTap={reduce ? undefined : tapPress}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </motion.button>
          </div>

          {/* 消息列表 */}
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={display(m.content)} />
            ))}
            {sendMut.isPending && (
              <MessageBubble
                role="assistant"
                text={display("{self}想想…")}
                typing
              />
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t border-white/5 bg-ink-900/80 p-2">
            <div className="flex gap-1.5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`和 ${petName || PET_DEFAULT_NAME} 说点什么…（Enter 发送）`}
                rows={2}
                className="flex-1 resize-none rounded-md border border-ink-700 bg-ink-800 px-2 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-500 focus:border-accent-400/40 focus:outline-none"
              />
              <motion.button
                type="button"
                disabled={!input.trim() || sendMut.isPending}
                onClick={handleSend}
                className="self-end rounded-md bg-accent-500 px-3 py-1.5 text-[11px] font-medium text-ink-900 hover:bg-accent-400 disabled:cursor-default disabled:opacity-50"
                whileHover={!input.trim() || sendMut.isPending || reduce ? undefined : hoverLift}
                whileTap={!input.trim() || sendMut.isPending || reduce ? undefined : tapPress}
              >
                发送
              </motion.button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function MessageBubble({
  role,
  text,
  typing,
}: {
  role: "user" | "assistant";
  text: string;
  typing?: boolean;
}): JSX.Element {
  const reduce = useReducedMotion() === true;
  const isAssistant = role === "assistant";
  return (
    <motion.div
      className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
    >
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
          isAssistant
            ? "rounded-bl-sm bg-accent-500/15 text-ink-100"
            : "rounded-br-sm bg-sky-500/30 text-sky-50"
        }`}
      >
        {text}
        {typing && <span className="ml-1 inline-flex">
          <MotionPulse>●</MotionPulse>
          <MotionPulse delay={0.16}>●</MotionPulse>
          <MotionPulse delay={0.32}>●</MotionPulse>
        </span>}
      </div>
    </motion.div>
  );
}

function buildSystemPrompt(name: string): string {
  const persona = applyPersona(
    [
      "你叫「{name}」，是一只{petLabel}，正在陪一位作者写小说。",
      "你性格活泼、温柔、会撒娇，但不矫情。说话简短，像真朋友的随口聊天。",
      "用「{self}」自称，称作者为「你」。",
      "回复要求：",
      "- 200-400 字之内（口语，自然分段）",
      "- 像写信、像随口聊天，不用 Markdown 标题/列表",
      "- 可以提建议、吐槽、鼓励、撒娇，但不要假装自己是真的活物",
      "- 不要复述用户的话",
      "- 偶尔用一次拟声词「{sound}」点缀",
      "- 不要用 emoji，除非情境特别合适（每次最多 1-2 个）",
    ].join("\n"),
    name,
  ).replace("{petLabel}", PET_LABEL);
  return persona;
}
