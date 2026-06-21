import type { ChapterOrigin } from "@inkforge/shared";
import { motion, useReducedMotion } from "motion/react";
import {
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../../lib/motion-tokens";
import { Badge } from "../ui";

const ITEMS: { key: ChapterOrigin | "all"; label: string; color: string }[] = [
  { key: "all", label: "全部", color: "text-ink-100" },
  { key: "ai-auto", label: "模型初稿", color: "text-violet-300" },
  { key: "ai-assisted", label: "模型陪写", color: "text-sky-300" },
  { key: "manual", label: "我手写", color: "text-emerald-300" },
];

interface ChapterOriginTabsProps {
  active: ChapterOrigin | null;
  counts: Record<ChapterOrigin, number>;
  onChange: (filter: ChapterOrigin | null) => void;
}

export function ChapterOriginTabs({
  active,
  counts,
  onChange,
}: ChapterOriginTabsProps): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-ink-700 bg-ink-900/30 px-2">
      {ITEMS.map((item) => {
        const isActive = item.key === "all" ? active === null : item.key === active;
        const count =
          item.key === "all"
            ? counts["ai-auto"] + counts["ai-assisted"] + counts.manual
            : counts[item.key];
        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key === "all" ? null : item.key)}
            aria-pressed={isActive}
            aria-label={`${item.label}章节，${count} 个`}
            className={`flex items-center gap-2 rounded-t-md px-3 py-1.5 text-xs transition-colors ${
              isActive
                ? "bg-ink-800 text-ink-100 ring-1 ring-accent-500/40"
                : "text-ink-400 hover:bg-ink-800/40 hover:text-ink-100"
            }`}
            {...buttonMotion}
          >
            <span className={item.color}>{item.label}</span>
            <motion.span
              layout
              className="inline-flex"
            >
              <Badge
                tone="neutral"
                className="rounded bg-ink-900/50 px-1.5 font-normal text-ink-400 ring-ink-700/60"
              >
                {count}
              </Badge>
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}
