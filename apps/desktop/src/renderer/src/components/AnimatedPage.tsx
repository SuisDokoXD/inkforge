// 页面切换的动效包裹层。配合 App.tsx 里的 <AnimatePresence mode="wait"> 使用，
// 让 13 个主视图在切换时有淡入+轻微上移的进出场过渡，取代原来的瞬间硬切。
// 尊重"减弱动态效果"：reduced-motion 下退化为纯淡入淡出（无位移）。
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fadeSlideUp, fadeOnly } from "../lib/motion-tokens";

export function AnimatedPage({ children }: { children: ReactNode }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      // 撑满父级 flex 列，保证内部页面仍能拿到全高度。
      className="flex min-h-0 flex-1 flex-col"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
