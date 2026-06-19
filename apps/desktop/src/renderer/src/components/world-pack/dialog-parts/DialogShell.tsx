// =============================================================================
// DialogShell —— 卡牌编辑对话框的外壳
// =============================================================================
// 提供：遮罩 + 居中容器 + sticky 标题栏 + 保存指示器 + 关闭按钮。
// 内部内容由调用方塞 children，与具体的编辑表单解耦。
// =============================================================================

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import { AnimatedDialog } from "../../AnimatedDialog";
import { MotionSpinner } from "../../MotionSpinner";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  tapPress,
} from "../../../lib/motion-tokens";

export type DialogSaveState = "idle" | "saving" | "saved";

interface DialogShellProps {
  children: ReactNode;
  onClose(): void;
  title?: string;
  subtitle?: string;
  saveState?: DialogSaveState;
}

export function DialogShell({
  children,
  onClose,
  title,
  subtitle,
  saveState,
}: DialogShellProps): JSX.Element {
  const reduce = useReducedMotion();
  const titleId = title ? "world-pack-dialog-title" : undefined;

  return (
    <AnimatedDialog
      open
      onClose={onClose}
      labelledBy={titleId}
      ariaLabel={title ? undefined : "卡牌编辑"}
      overlayClassName="flex items-center justify-center p-4 backdrop-blur-sm"
      panelClassName="relative h-[88vh] w-[1080px] max-w-[96vw] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl ring-1 ring-accent-500/20"
    >
      <motion.div
        className="h-full"
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        {title && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-ink-700/80 bg-ink-900/85 px-4 py-2.5 backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <div id={titleId} className="truncate text-sm font-semibold text-ink-100">
                {title}
              </div>
              {subtitle && (
                <div className="truncate text-[11px] text-ink-400">{subtitle}</div>
              )}
            </div>
            {saveState && saveState !== "idle" && (
              <motion.span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-[color,background-color,box-shadow,opacity] duration-200 ${
                  saveState === "saving"
                    ? "bg-ink-800 text-ink-300"
                    : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40"
                }`}
                variants={reduce ? fadeOnly : fadeSlideUp}
                initial="initial"
                animate="animate"
              >
                {saveState === "saving" ? (
                  <>
                    <MotionSpinner className="h-3 w-3" />
                    保存中
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    已保存
                  </>
                )}
              </motion.span>
            )}
            <motion.button
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              title="关闭 (Esc)"
              aria-label="关闭卡牌编辑"
              whileHover={hoverLift}
              whileTap={tapPress}
            >
              <X className="h-4 w-4" />
            </motion.button>
          </div>
        )}
        <div className={title ? "h-full pt-[52px]" : "h-full"}>{children}</div>
      </motion.div>
    </AnimatedDialog>
  );
}

// 表单字段标签：统一的小号大写字间距样式
export function FieldLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <label className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
      {children}
    </label>
  );
}
