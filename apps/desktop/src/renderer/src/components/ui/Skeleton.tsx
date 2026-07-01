// B3: 骨架屏通用组件。所有数据加载页面用统一的占位动效，
// 替代空白页或纯文字"加载中…"，提升感知性能。

import { useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

interface SkeletonBaseProps {
  className?: string;
}

/** 单行文字骨架：高度匹配正文行高，宽度可调（默认 100%）。 */
export function SkeletonLine({ className }: SkeletonBaseProps): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-4 rounded-md bg-ink-600/40",
        !reduce && "animate-pulse",
        className,
      )}
    />
  );
}

/** 卡片骨架：含标题行 + 两行正文 + 底部操作区占位。 */
export function SkeletonCard({ className }: SkeletonBaseProps): JSX.Element {
  return (
    <div aria-hidden="true" className={cn("space-y-3 rounded-lg border border-ink-700 bg-ink-800/50 p-4", className)}>
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-4/5" />
      <div className="flex gap-2 pt-2">
        <SkeletonLine className="h-8 w-16" />
        <SkeletonLine className="h-8 w-16" />
      </div>
    </div>
  );
}

/** 列表骨架：N 行错宽文字占位，模拟真实列表加载态。
 *  @param rows 行数（默认 5） */
export function SkeletonList({
  className,
  rows = 5,
}: SkeletonBaseProps & { rows?: number }): JSX.Element {
  return (
    <div aria-hidden="true" className={cn("space-y-3 px-3 py-4", className)} role="status">
      <span className="sr-only">加载中…</span>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonLine
          key={i}
          className={
            // 错开宽度模拟真实列表
            i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-3/4" : "w-1/2"
          }
        />
      ))}
    </div>
  );
}

/** 编辑器骨架：大块内容区域，模拟 TipTap 编辑区加载态。 */
export function SkeletonEditor({ className }: SkeletonBaseProps): JSX.Element {
  return (
    <div aria-hidden="true" className={cn("space-y-3 px-8 py-8", className)}>
      <SkeletonLine className="h-6 w-1/2" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-11/12" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-3/5" />
      <div className="py-4" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-4/5" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}

/** 进度条：用于 AI 长操作（AutoWriter 阶段、review 进度等）。
 *  @param value 0-100 进度百分比，不传则显示不确定模式（来回扫光） */
export function ProgressBar({
  value,
  className,
  label,
}: {
  value?: number;
  className?: string;
  label?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  const hasValue = typeof value === "number";

  return (
    <div
      role="progressbar"
      aria-valuenow={hasValue ? value : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "进度"}
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-ink-600/40",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-accent-500",
          !hasValue && "w-1/3",
          !reduce && !hasValue && "animate-indeterminate-progress",
        )}
        style={hasValue ? { width: `${Math.min(100, Math.max(0, value))}%` } : undefined}
      />
    </div>
  );
}
