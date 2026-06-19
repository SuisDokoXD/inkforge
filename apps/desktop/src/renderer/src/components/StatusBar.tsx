import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText } from "lucide-react";
import { dailyApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  DUR,
  EASE_STANDARD,
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";
import { DailySummaryDialog } from "./DailySummaryDialog";
import { UpdateIndicator } from "./UpdateIndicator";

function formatNumber(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

export function StatusBar(): JSX.Element {
  // Return primitives, not a freshly-constructed object. useSyncExternalStore
  // compares with Object.is; returning `{ status, error }` every call mints a
  // new reference, is always ≠ previous snapshot, and schedules another render
  // — which re-runs the selector forever. Pulling scalars directly lets the
  // default equality actually hold.
  const analysisStatus = useAppStore((s) => s.analyses[0]?.status ?? null);
  const analysisError = useAppStore((s) => s.analyses[0]?.error);
  const projectId = useAppStore((s) => s.currentProjectId);
  const chapterStats = useAppStore((s) => s.currentChapterStats);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const reduceMotion = useReducedMotion() === true;
  const t = useT();

  const progressQuery = useQuery({
    queryKey: ["daily-progress", projectId],
    queryFn: () =>
      projectId ? dailyApi.progress({ projectId }) : Promise.resolve(null),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });

  const progress = progressQuery.data ?? null;
  const percent = progress && progress.goal > 0
    ? Math.min(100, Math.round((progress.wordsAdded / progress.goal) * 100))
    : 0;
  const progressVariants = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const analysisText =
    analysisStatus === "streaming"
      ? t("common.loading")
      : analysisStatus === "failed"
        ? `建议暂时不可用：${friendlyErrorMessage(analysisError, "请稍后重试。")}`
        : "模型就绪";
  const analysisTone = analysisStatus === "failed" ? "text-red-300" : "text-ink-300";
  const analysisKey = analysisStatus === "failed" ? `failed-${analysisError ?? ""}` : (analysisStatus ?? "ready");

  return (
    <footer className="flex items-center justify-between border-t border-ink-700 bg-ink-800/60 px-4 py-1 text-xs text-ink-400">
      <div className="flex items-center gap-3">
        <span>InkForge · 墨炉</span>
        {progress && (
          <motion.div
            className="flex items-center gap-2"
            variants={progressVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className="h-1.5 w-40 overflow-hidden rounded-full bg-ink-700"
              role="progressbar"
              aria-label="今日写作目标进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <motion.div
                className={`h-full rounded-full transition-[width,background-color] duration-300 ${
                  progress.goalHit ? "bg-green-400" : "bg-accent-400"
                }`}
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: reduceMotion ? 0 : DUR.slow, ease: EASE_STANDARD }}
              />
            </div>
            <span className={progress.goalHit ? "text-green-300" : "text-ink-300"}>
              {t("status.dailyGoal")} {progress.wordsAdded}/{progress.goal}
              {progress.goalHit && ` · ${t("common.finish")}`}
            </span>
          </motion.div>
        )}
        {chapterStats && (
          <span
            className="rounded border border-ink-700/70 bg-ink-900/60 px-2 py-0.5 font-mono text-[11px] text-ink-300"
            title={t("status.words")}
          >
            中文 {formatNumber(chapterStats.cjk)} · 英文 {formatNumber(chapterStats.en)} · 约
            {formatNumber(chapterStats.tokens)} 预估消耗
          </span>
        )}
        {projectId && (
          <motion.button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
            title="基于当天字数与最近章节生成今日总结"
            {...buttonMotion}
          >
            <FileText aria-hidden className="h-3.5 w-3.5" />
            今日总结
          </motion.button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={analysisKey}
            className={analysisTone}
            aria-live="polite"
            variants={reduceMotion ? fadeOnly : fadeSlideUp}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {analysisText}
          </motion.span>
        </AnimatePresence>
        <UpdateIndicator />
      </div>
      {projectId && (
        <DailySummaryDialog
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          projectId={projectId}
        />
      )}
    </footer>
  );
}
