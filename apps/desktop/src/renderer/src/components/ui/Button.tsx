// Button / IconButton —— 全站统一按钮原子组件。
// 用 cva 收敛历史上手写散落 80+ 处的按钮样式（primary/secondary/ghost/danger/accentSoft × 尺寸），
// 默认值固化自当前已润色的视觉规范（rounded-lg、px-2.5 py-1.5、focus-visible ring）。
// 动效复用全站统一的 hoverLift/tapPress（motion-tokens），并按 useReducedMotion 与 disabled 自动降级。
import { forwardRef } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { hoverLift, tapPress, SPRING_SNAPPY } from "../../lib/motion-tokens";

// 按钮样式变体表。base 含布局/圆角/过渡/焦点环/禁用态；variant 决定配色；size 决定尺寸。
// size 同时容纳文字按钮（sm/md/lg，带内边距）与图标按钮（iconXs/iconSm/iconMd，正方形无内边距）。
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent-500 font-medium text-ink-900 hover:bg-accent-400",
        secondary: "border border-ink-600 text-ink-300 hover:bg-ink-700/60 hover:text-ink-100",
        ghost: "text-ink-400 hover:bg-ink-800 hover:text-ink-200",
        danger: "bg-rose-500/15 font-medium text-rose-200 hover:bg-rose-500/25",
        // 激活/按下态（如"终端已开"），配合 aria-pressed 使用。
        accentSoft: "border border-accent-500/60 bg-accent-500/20 text-accent-200 hover:bg-accent-500/25",
      },
      size: {
        sm: "px-2.5 py-1.5 text-xs",
        md: "px-2.5 py-1.5 text-sm",
        lg: "px-4 py-1.5 text-sm",
        iconXs: "h-5 w-5",
        iconSm: "h-8 w-8",
        iconMd: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends HTMLMotionProps<"button">,
    VariantProps<typeof buttonVariants> {}

// 文字按钮。默认 type="button" 防止误触发表单提交。
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", disabled, children, ...props },
  ref,
) {
  const reduceMotion = useReducedMotion() === true;
  // 仅在可交互（未禁用）且未开启"减弱动态"时挂 hover/tap 微交互，保持全站一致手感。
  const motionProps =
    reduceMotion || disabled
      ? {}
      : { whileHover: hoverLift, whileTap: tapPress, transition: SPRING_SNAPPY };
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), className)}
      {...motionProps}
      {...props}
    >
      {children}
    </motion.button>
  );
});

// 图标按钮尺寸 → buttonVariants 的 icon* 尺寸映射。
const ICON_SIZE = { xs: "iconXs", sm: "iconSm", md: "iconMd" } as const;

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  /** 无障碍必填：图标按钮无可见文字，必须提供 aria-label 供读屏识别。 */
  "aria-label": string;
  size?: keyof typeof ICON_SIZE;
}

// 仅含图标的方形按钮。强制 aria-label，复用 Button 的变体与动效。
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "sm", ...props },
  ref,
) {
  return <Button ref={ref} size={ICON_SIZE[size]} {...props} />;
});
