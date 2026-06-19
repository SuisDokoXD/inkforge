// Tabs —— 受控分段切换器。两种外观：underline（下划线，等宽铺满）与 pill（胶囊）。
// 收敛全站重复的"激活项加 accent 下划线/底色"切换 UI。语义用 aria-pressed（与既有用法一致，
// 避免在无 tabpanel 的场景误用 role=tab）。动效复用全站 hoverLift/tapPress 并按 reduced-motion 降级。
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";
import { hoverLift, tapPress, SPRING_SNAPPY } from "../../lib/motion-tokens";

export interface TabItem {
  key: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  variant?: "underline" | "pill";
  className?: string;
  "aria-label"?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  className,
  ...rest
}: TabsProps): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const motionProps = reduceMotion
    ? {}
    : { whileHover: hoverLift, whileTap: tapPress, transition: SPRING_SNAPPY };

  return (
    <div
      className={cn(
        variant === "underline" ? "flex border-b border-ink-700 text-xs" : "inline-flex gap-1",
        className,
      )}
      {...rest}
    >
      {items.map((item) => {
        const active = item.key === value;
        const cls =
          variant === "underline"
            ? cn(
                "flex-1 py-2.5 transition-colors",
                active
                  ? "border-b-2 border-accent-500 text-accent-300"
                  : "text-ink-400 hover:text-ink-100",
              )
            : cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                  : "text-ink-300 hover:bg-ink-700/60 hover:text-ink-100",
              );
        return (
          <motion.button
            key={item.key}
            type="button"
            aria-pressed={active}
            className={cls}
            onClick={() => onChange(item.key)}
            {...motionProps}
          >
            {item.label}
          </motion.button>
        );
      })}
    </div>
  );
}
