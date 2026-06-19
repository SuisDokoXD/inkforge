import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { CompanionState } from "../../stores/companion-store";
import { DUR, EASE_STANDARD } from "../../lib/motion-tokens";

interface CompanionBubbleProps {
  /** 桌宠精灵中心点屏幕坐标（px） */
  anchorX: number;
  anchorY: number;
  /** 桌宠 sprite 当前像素半径，用于计算气泡偏移避免重叠 */
  anchorRadius: number;
  /** 气泡内容；为空则不渲染 */
  message: string;
  /** 状态影响强调色（idle/typing/sleepy/cheering/midnight） */
  state: CompanionState;
}

/**
 * 桌宠对话气泡。
 *
 * 设计原则（汲取 iOS Messages / Telegram / macOS Notification / Apple Calendar
 * popover / Linear / Vercel toast / Raycast / Notion hover card / Discord
 * tooltip / Spotify Now Playing / Cursor / Arc 等多家现代桌面/移动应用的设计语言）：
 *
 *   1. 用 createPortal 渲染到 document.body —— 完全脱离桌宠的 stacking context，
 *      永远不会被精灵盖住（z-index 不再依赖父链）。
 *   2. 屏幕坐标驱动定位 —— 自适应翻转：靠右边时左移；靠顶时朝下；
 *      tail 始终指向精灵中心。
 *   3. 玻璃态背景 —— backdrop-blur + 半透明白底 + 多层阴影（24px ambient + 4px key）。
 *   4. 状态强调色 —— 左侧 1px 渐变描边随情绪切换：
 *        idle/typing → amber       sleepy → indigo
 *        cheering → emerald        midnight → violet
 *   5. 中文衬线字体 + 行高 1.55 —— 保证短句不会被竖排（min-w-[160px] + nowrap 单行兜底）。
 *   6. 入场 200 ms 上滑淡入 —— 不打扰，并尊重系统减弱动态效果。
 *   7. SVG 尾巴 —— 矢量绘制带阴影，方向随翻转旋转，永远指向桌宠。
 */
export function CompanionBubble({
  anchorX,
  anchorY,
  anchorRadius,
  message,
  state,
}: CompanionBubbleProps): JSX.Element | null {
  const reduce = useReducedMotion() === true;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [bubbleEl, setBubbleEl] = useState<HTMLDivElement | null>(null);

  // 测量气泡实际尺寸，再计算翻转
  useEffect(() => {
    if (!bubbleEl) return;
    const rect = bubbleEl.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
  }, [bubbleEl, message]);

  if (!message) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const gap = 14; // 气泡与精灵之间的间距
  const w = size?.w ?? 200;
  const h = size?.h ?? 64;

  // 默认气泡在精灵正上方
  let placement: "top" | "bottom" | "left" | "right" = "top";
  let bubbleLeft: number;
  let bubbleTop: number;

  // 优先尝试上方；不够则下方；左右在极少情况下使用
  const spaceTop = anchorY - anchorRadius;
  const spaceBottom = vh - anchorY - anchorRadius;
  if (spaceTop < h + gap + margin && spaceBottom > h + gap + margin) {
    placement = "bottom";
  } else {
    placement = "top";
  }

  if (placement === "top") {
    bubbleTop = anchorY - anchorRadius - gap - h;
    bubbleLeft = anchorX - w / 2;
  } else {
    bubbleTop = anchorY + anchorRadius + gap;
    bubbleLeft = anchorX - w / 2;
  }

  // 横向越界纠正
  if (bubbleLeft < margin) bubbleLeft = margin;
  if (bubbleLeft + w > vw - margin) bubbleLeft = vw - margin - w;

  // 计算 tail 在气泡上的水平位置（相对气泡左边）
  const tailX = Math.max(16, Math.min(w - 16, anchorX - bubbleLeft));

  const accent = ACCENT_BY_STATE[state];
  const enterInitial = reduce
    ? { opacity: 0 }
    : { opacity: 0, y: placement === "top" ? 6 : -6, scale: 0.96 };
  const enterAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  return createPortal(
    <motion.div
      ref={setBubbleEl}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-[9999]"
      initial={enterInitial}
      animate={enterAnimate}
      transition={{ duration: DUR.base, ease: EASE_STANDARD }}
      style={{
        left: `${bubbleLeft}px`,
        top: `${bubbleTop}px`,
        // 让初次未测量时也有合理表现
        minWidth: 160,
        maxWidth: 260,
      }}
    >
      <div
        className="relative overflow-visible rounded-2xl px-4 py-2.5 text-[12.5px] leading-[1.55] text-stone-800 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_28px_-4px_rgba(0,0,0,0.45)] backdrop-blur-md"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,253,247,0.97), rgba(254,243,217,0.96))",
          fontFamily:
            '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "PingFang SC", system-ui, sans-serif',
        }}
      >
        {/* 左侧 2px 状态强调色条 */}
        <div
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-full"
          style={{ background: accent.bar }}
        />
        {/* 右上角图标小点（情绪） */}
        <div
          aria-hidden
          className="absolute right-2.5 top-2 text-[10px] opacity-70"
          style={{ color: accent.icon }}
        >
          {accent.dot}
        </div>
        <div className="pl-1 pr-3 whitespace-pre-wrap break-words">
          {message}
        </div>
      </div>

      {/* SVG tail，根据 placement 旋转 */}
      <svg
        aria-hidden
        width="20"
        height="12"
        viewBox="0 0 20 12"
        className="pointer-events-none absolute"
        style={{
          left: `${tailX - 10}px`,
          ...(placement === "top"
            ? { bottom: "-9px", transform: "rotate(0deg)" }
            : { top: "-9px", transform: "rotate(180deg)" }),
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.25))",
        }}
      >
        <path
          d="M0 0 Q10 0 10 12 Q10 0 20 0 Z"
          fill="rgba(254,243,217,0.96)"
        />
      </svg>
    </motion.div>,
    document.body,
  );
}

const ACCENT_BY_STATE: Record<
  CompanionState,
  { bar: string; icon: string; dot: string }
> = {
  idle: {
    bar: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)",
    icon: "#b45309",
    dot: "✦",
  },
  typing: {
    bar: "linear-gradient(180deg, #fb923c 0%, #f97316 100%)",
    icon: "#c2410c",
    dot: "⌨",
  },
  sleepy: {
    bar: "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)",
    icon: "#4338ca",
    dot: "𝓏",
  },
  cheering: {
    bar: "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
    icon: "#047857",
    dot: "✨",
  },
  midnight: {
    bar: "linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%)",
    icon: "#5b21b6",
    dot: "☾",
  },
  petted: {
    bar: "linear-gradient(180deg, #fb7185 0%, #e11d48 100%)",
    icon: "#9f1239",
    dot: "❤",
  },
  "pomodoro-work": {
    bar: "linear-gradient(180deg, #f97316 0%, #ea580c 100%)",
    icon: "#9a3412",
    dot: "🍅",
  },
  "pomodoro-break": {
    bar: "linear-gradient(180deg, #34d399 0%, #059669 100%)",
    icon: "#065f46",
    dot: "🍵",
  },
  dizzy: {
    bar: "linear-gradient(180deg, #f472b6 0%, #db2777 100%)",
    icon: "#9d174d",
    dot: "💫",
  },
  wishing: {
    bar: "linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)",
    icon: "#92400e",
    dot: "🌟",
  },
  hidden: { bar: "transparent", icon: "transparent", dot: "" },
};
