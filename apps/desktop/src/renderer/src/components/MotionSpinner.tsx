import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { EASE_IN_OUT } from "../lib/motion-tokens";

interface MotionSpinProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

interface MotionSpinnerProps {
  className?: string;
}

interface MotionPulseProps {
  children?: ReactNode;
  active?: boolean;
  className?: string;
  delay?: number;
  duration?: number;
  maxOpacity?: number;
  minOpacity?: number;
  style?: CSSProperties;
}

export function MotionSpin({
  children,
  active = true,
  className = "inline-flex",
}: MotionSpinProps): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const shouldRotate = active && !reduceMotion;

  return (
    <motion.span
      aria-hidden
      className={className}
      animate={shouldRotate ? { rotate: 360 } : { rotate: 0 }}
      transition={
        shouldRotate
          ? { duration: 0.9, ease: "linear", repeat: Infinity }
          : { duration: 0 }
      }
    >
      {children}
    </motion.span>
  );
}

export function MotionPulse({
  children,
  active = true,
  className = "inline-flex",
  delay = 0,
  duration = 1.2,
  maxOpacity = 1,
  minOpacity = 0.38,
  style,
}: MotionPulseProps): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const shouldPulse = active && !reduceMotion;

  return (
    <motion.span
      aria-hidden
      className={className}
      style={style}
      animate={shouldPulse ? { opacity: [maxOpacity, minOpacity, maxOpacity] } : { opacity: maxOpacity }}
      transition={
        shouldPulse
          ? { duration, ease: EASE_IN_OUT, repeat: Infinity, delay }
          : { duration: 0 }
      }
    >
      {children}
    </motion.span>
  );
}

export function MotionSpinner({
  className = "h-3.5 w-3.5",
}: MotionSpinnerProps): JSX.Element {
  return (
    <MotionSpin>
      <Loader2 className={className} />
    </MotionSpin>
  );
}
