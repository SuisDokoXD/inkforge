import { useReducedMotion } from "motion/react";
import type { CompanionState } from "../../stores/companion-store";

interface CompanionLottieProps {
  state: CompanionState;
  hovered?: boolean;
}

function animationClass(state: CompanionState): string {
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
}

function palette(state: CompanionState): { body: string; belly: string; accent: string } {
  switch (state) {
    case "typing":
      return { body: "#8bd5ca", belly: "#d6fff7", accent: "#38bdf8" };
    case "cheering":
      return { body: "#f9c74f", belly: "#fff2b8", accent: "#fb7185" };
    case "sleepy":
      return { body: "#a5b4fc", belly: "#e0e7ff", accent: "#818cf8" };
    case "dizzy":
      return { body: "#f0abfc", belly: "#fae8ff", accent: "#e879f9" };
    case "petted":
      return { body: "#fda4af", belly: "#ffe4e6", accent: "#fb7185" };
    case "pomodoro-work":
      return { body: "#f87171", belly: "#fee2e2", accent: "#ef4444" };
    case "pomodoro-break":
      return { body: "#86efac", belly: "#dcfce7", accent: "#22c55e" };
    case "wishing":
      return { body: "#c4b5fd", belly: "#ede9fe", accent: "#facc15" };
    case "midnight":
      return { body: "#94a3b8", belly: "#e2e8f0", accent: "#60a5fa" };
    default:
      return { body: "#f5b450", belly: "#fff1cc", accent: "#6ee7b7" };
  }
}

export function CompanionLottie({ state, hovered }: CompanionLottieProps): JSX.Element | null {
  const reduce = useReducedMotion();
  if (state === "hidden") return null;

  const colors = palette(state);
  const animated = reduce ? "" : animationClass(state);
  const isSleepy = state === "sleepy" || state === "midnight";
  const isDizzy = state === "dizzy";
  const isHappy = hovered || state === "cheering" || state === "petted" || state === "wishing";

  return (
    <div
      className={`relative h-16 w-16 ${animated}`}
      style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.35))" }}
      aria-hidden="true"
    >
      <svg className="h-16 w-16" viewBox="0 0 64 64" role="img">
        <defs>
          <radialGradient id="companion-body" cx="38%" cy="28%" r="75%">
            <stop offset="0%" stopColor={colors.belly} />
            <stop offset="58%" stopColor={colors.body} />
            <stop offset="100%" stopColor="#6b5a3e" stopOpacity="0.22" />
          </radialGradient>
          <linearGradient id="companion-ear" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.body} />
            <stop offset="100%" stopColor={colors.accent} />
          </linearGradient>
        </defs>

        <ellipse cx="32" cy="58" rx="19" ry="4" fill="#020617" opacity="0.22" />
        <path
          d="M17 23c-4-11 4-17 12-8M47 23c4-11-4-17-12-8"
          fill="none"
          stroke="#2f2a24"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M18 23c-3-9 3-13 9-7M46 23c3-9-3-13-9-7"
          fill="none"
          stroke="url(#companion-ear)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <ellipse cx="32" cy="34" rx="22" ry="24" fill="url(#companion-body)" />
        <ellipse cx="32" cy="42" rx="13" ry="10" fill={colors.belly} opacity="0.72" />

        {isDizzy ? (
          <>
            <path d="M20 31l6 6M26 31l-6 6M38 31l6 6M44 31l-6 6" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M27 44c3 2 7 2 10 0" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </>
        ) : isSleepy ? (
          <>
            <path d="M20 34c3 2 6 2 9 0M35 34c3 2 6 2 9 0" stroke="#1f2937" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M28 43c3 1.8 6 1.8 9 0" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <circle cx="24" cy="34" r={isHappy ? 3.4 : 3} fill="#172033" />
            <circle cx="40" cy="34" r={isHappy ? 3.4 : 3} fill="#172033" />
            <circle cx="25" cy="33" r="1" fill="#ffffff" opacity="0.9" />
            <circle cx="41" cy="33" r="1" fill="#ffffff" opacity="0.9" />
            <path
              d={isHappy ? "M27 43c3 4 8 4 11 0" : "M28 43c3 2.2 6 2.2 9 0"}
              stroke="#1f2937"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}

        <circle cx="17" cy="39" r="3" fill="#fb7185" opacity="0.35" />
        <circle cx="47" cy="39" r="3" fill="#fb7185" opacity="0.35" />
        <path
          d="M14 48c-7 1-9-5-5-9M50 48c7 1 9-5 5-9"
          fill="none"
          stroke={colors.accent}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {state === "wishing" && (
          <path
            d="M50 12l1.4 4.1 4.3.1-3.4 2.6 1.2 4.2-3.5-2.4-3.6 2.4 1.2-4.2-3.4-2.6 4.3-.1z"
            fill="#facc15"
          />
        )}
      </svg>
    </div>
  );
}
