// Tooltip —— 轻量纯 CSS 悬浮提示（group-hover 控制显隐，不引入定位库）。
// 外观复用既有 tooltip 风格（rounded-lg border-ink-600 bg-ink-800）。side 控制相对触发器的方位。
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const SIDE = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
} as const;

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: keyof typeof SIDE;
  className?: string;
}

export function Tooltip({ content, children, side = "top", className }: TooltipProps): JSX.Element {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100 opacity-0 shadow transition-opacity group-hover/tooltip:opacity-100",
          SIDE[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
