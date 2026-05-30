import { useEffect, useRef } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useReducedMotion } from "motion/react";
import type { CompanionState } from "../../stores/companion-store";
import mascotAnimation from "../../assets/companion/mascot.json";

interface CompanionLottieProps {
  state: CompanionState;
  /** 是否被悬停（保留入参以对齐旧 PetSprite 接口；当前不改变 Lottie 行为） */
  hovered?: boolean;
}

/**
 * 单一吉祥物桌宠：用 Lottie 动画取代原先 4 物种的手绘 SVG（PetSprite）。
 *
 * 设计要点（替换 PetSprite 后保持行为一致）：
 *  - hidden 状态不渲染；
 *  - 复用与 PetSprite 相同的 64×64 包裹 + drop-shadow + 椭圆地面阴影；
 *  - 状态表达不靠重绘角色（现成 Lottie 做不到 11 种专属造型），改为：
 *      · 容器级 CSS 关键帧（styles.css 的 companion-bob/jump/breathe/dizzy）；
 *      · 叠层贴纸/粒子由 Companion 外层的 CompanionParticles / FestiveOverlay 负责；
 *      · Lottie 播放速度随状态微调（打字快、瞌睡慢…）；
 *  - 尊重 reduced-motion：暂停为静态首帧，容器动画亦随系统设置停止。
 *
 * 素材为占位（assets/companion/mascot.json），见同目录 LICENSE-mascot.txt 替换说明。
 */
export function CompanionLottie({ state }: CompanionLottieProps): JSX.Element | null {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const reduce = useReducedMotion();

  // 状态 → 播放速度：用速度差异传达情绪，避免依赖角色重绘。
  const speed = (() => {
    switch (state) {
      case "typing":
        return 1.4;
      case "cheering":
        return 1.7;
      case "petted":
        return 1.3;
      case "sleepy":
        return 0.55;
      case "pomodoro-break":
        return 0.8;
      default:
        return 1;
    }
  })();

  // reduced-motion 暂停为静态首帧；否则按当前状态设速并播放。
  useEffect(() => {
    const api = lottieRef.current;
    if (!api) return;
    if (reduce) {
      api.goToAndStop(0, true);
      return;
    }
    api.setSpeed(speed);
    api.play();
  }, [speed, reduce]);

  if (state === "hidden") return null;

  // 状态 → 容器 CSS 关键帧（与原 PetSprite 一致，keyframes 定义在 styles.css）。
  const animClass = (() => {
    switch (state) {
      case "typing":
        return "animate-[companion-bob_0.45s_ease-in-out_infinite]";
      case "cheering":
        return "animate-[companion-jump_0.7s_cubic-bezier(0.22,1,0.36,1)_infinite]";
      case "sleepy":
        return "animate-[companion-breathe_3.5s_ease-in-out_infinite]";
      case "dizzy":
        return "animate-[companion-dizzy_1.2s_linear_infinite]";
      case "petted":
        return "animate-[companion-breathe_1.2s_ease-in-out_infinite]";
      case "pomodoro-break":
        return "animate-[companion-breathe_2s_ease-in-out_infinite]";
      case "wishing":
        return "animate-[companion-breathe_2.2s_ease-in-out_infinite]";
      default:
        return "";
    }
  })();

  return (
    <div
      className={`relative h-16 w-16 ${reduce ? "" : animClass}`}
      style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.35))" }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={mascotAnimation}
        loop
        autoplay={!reduce}
        className="h-16 w-16"
      />
    </div>
  );
}
