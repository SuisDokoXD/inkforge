// Badge —— 状态徽章 / 标签 / 计数 Pill。收敛全站 60+ 处 rounded-full + ring-1 的小标签。
// tone 决定语义配色（强调/成功/警告/危险/中性），size 决定尺寸（10px 微型 / xs 常规）。
import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeVariants = cva("inline-flex items-center rounded-full font-medium ring-1", {
  variants: {
    tone: {
      accent: "bg-accent-500/15 text-accent-200 ring-accent-500/25",
      success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
      warning: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
      danger: "bg-rose-500/15 text-rose-200 ring-rose-500/25",
      neutral: "bg-ink-700 text-ink-300 ring-ink-600",
    },
    size: {
      sm: "px-2 py-0.5 text-[10px]",
      md: "px-2.5 py-0.5 text-xs",
    },
  },
  defaultVariants: { tone: "neutral", size: "sm" },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
