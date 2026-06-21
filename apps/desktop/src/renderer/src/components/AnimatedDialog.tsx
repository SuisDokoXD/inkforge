// 全局统一的模态弹窗封装。把原先散落在各弹窗里重复的「遮罩 + 居中面板 + Esc 关闭 +
// 点遮罩关闭 + role/aria」收口到一处，并用 <AnimatePresence> 提供进出场动画
// （遮罩淡入、面板 scale+上移弹入；关闭时播放退场而非瞬间消失）。
// 新弹窗直接用它包裹内容即可，风格天然一致。reduced-motion 下退化为纯淡入。
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { overlayFade, dialogPanel, fadeOnly } from "../lib/motion-tokens";
import { cn } from "../lib/cn";

export interface AnimatedDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 遮罩层定位/对齐类，默认居中。需要顶部对齐（如命令面板）时覆写。 */
  overlayClassName?: string;
  /** 面板容器类（尺寸/圆角/背景等）。 */
  panelClassName?: string;
  /** 无障碍标签。 */
  ariaLabel?: string;
  labelledBy?: string;
  /** z-index 层级，默认 50。命令面板等需要更高时覆写。 */
  zClassName?: string;
}

export function AnimatedDialog({
  open,
  onClose,
  children,
  overlayClassName = "flex items-center justify-center p-4",
  panelClassName = "",
  ariaLabel,
  labelledBy,
  zClassName = "z-50",
}: AnimatedDialogProps): JSX.Element {
  const reduce = useReducedMotion();

  // Esc 关闭：统一在这里处理，迁移后各弹窗不再各自写一遍。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0",
            "bg-black/60",
            zClassName,
            overlayClassName,
          )}
          variants={overlayFade}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            className={cn("dialog-surface", panelClassName)}
            variants={reduce ? fadeOnly : dialogPanel}
            // 面板继承父级的 initial/animate/exit 编排状态。
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
