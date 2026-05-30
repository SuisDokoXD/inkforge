// 全局动效规范（苹果质感）。所有动画统一从这里取缓动/时长/spring/变体，
// 保证整个 App 的动效风格一致。新增动画时优先复用这里的导出，不要各处硬编码数值。
import type { Transition, Variants } from "motion/react";

// 缓动曲线 ───────────────────────────────────────────────
// EASE_STANDARD：easeOutQuint，收尾极缓，最接近 macOS/iOS 默认过渡的"丝滑落定"感。
//                用于绝大多数进场/位移动画。
export const EASE_STANDARD = [0.22, 1, 0.36, 1] as const;
// EASE_IN_OUT：对称缓动，用于需要"来回都顺"的场景（如折叠展开）。
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;

// 时长（秒）──────────────────────────────────────────────
// 苹果的丝滑来自克制：进场 base、退场更快（fast），避免拖沓。
export const DUR = {
  fast: 0.15,
  base: 0.25,
  slow: 0.35,
} as const;

// spring 预设 ────────────────────────────────────────────
// SPRING_GENTLE：柔和回弹，用于弹窗/面板进场，有物理感但不过冲。
export const SPRING_GENTLE: Transition = { type: "spring", stiffness: 260, damping: 30 };
// SPRING_SNAPPY：偏硬、响应快，用于 hover/tap 等即时微交互。
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 400, damping: 35 };

// 可复用变体 ─────────────────────────────────────────────

// 页面切换：淡入 + 轻微上移；退场快速淡出并微微上移（衔接 mode="wait"）。
export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_STANDARD } },
  exit: { opacity: 0, y: -4, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
};

// reduced-motion 退化版：只淡入淡出，无任何位移/缩放（尊重"减弱动态效果"）。
export const fadeOnly: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DUR.fast } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
};

// 弹窗遮罩：纯透明度淡入淡出。
export const overlayFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DUR.base, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
};

// 弹窗面板：scale + 淡入 + 轻微上移，spring 回弹；退场快速缩回淡出。
export const dialogPanel: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_GENTLE },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
};

// 列表容器：让子项错峰出现（stagger），营造"逐个落定"的层次感。
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
  exit: {},
};

// 列表项：配合 staggerContainer 使用，淡入 + 上移。
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
};

// hover/tap 微交互的统一手感（卡片、图标按钮）。幅度保守，避免浮夸。
export const hoverLift = { scale: 1.02 } as const;
export const tapPress = { scale: 0.98 } as const;
