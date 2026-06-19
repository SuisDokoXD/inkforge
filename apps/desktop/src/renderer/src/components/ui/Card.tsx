// Card —— 通用卡片/面板容器，收敛全站 40+ 处 rounded-lg + border-ink-700 + bg-ink-800/40 组合。
// padding 控制内边距档位；highlight 为选中/激活态加上 accent 描边与 ring。
import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const cardVariants = cva("rounded-lg border border-ink-700 bg-ink-800/40", {
  variants: {
    padding: { none: "", sm: "p-3", md: "p-4", lg: "p-5" },
    highlight: { true: "border-accent-500/70 ring-2 ring-accent-500/35", false: "" },
  },
  defaultVariants: { padding: "md", highlight: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, padding, highlight, ...props }: CardProps): JSX.Element {
  return <div className={cn(cardVariants({ padding, highlight }), className)} {...props} />;
}
