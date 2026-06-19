// Divider —— 分隔线。horizontal（整行）/ vertical（容器内竖线）/ short（侧栏分组短横线，如 ActivityBar）。
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** 短横线：用于侧栏图标分组之间的视觉断点。 */
  short?: boolean;
}

export function Divider({
  orientation = "horizontal",
  short,
  className,
  ...props
}: DividerProps): JSX.Element {
  const base =
    orientation === "vertical"
      ? "w-px self-stretch bg-ink-700"
      : short
        ? "my-2 h-px w-6 bg-ink-700/70"
        : "h-px w-full bg-ink-700/70";
  return <div role="separator" aria-hidden className={cn(base, className)} {...props} />;
}
