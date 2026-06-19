import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText } from "lucide-react";
import { dailyApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { DUR, EASE_STANDARD, fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { DailySummaryDialog } from "./DailySummaryDialog";
import { UpdateIndicator } from "./UpdateIndicator";
import { Button } from "./ui";

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
  const analysisText =
    analysisStatus === "streaming"
      ? t("common.loading")
      : analysisStatus === "failed"
        ? `建议暂时不可用：${friendlyErrorMessage(analysisError, "请稍后重试。")}`
        : "模型就绪";
  const analysisTone = analysisStatus === "failed" ? "text-red-300" : "text-ink-300";
  const analysisKey = analysisStatus === "failed" ? `failed-${analysisError ?? ""}` : (analysisStatus ?? "ready");

  return (
    <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-ink-700 bg-ink-800/60 px-4 py-1.5 text-xs text-ink-400">
      <div className="flex min-w-0 items-center gap-3">
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
              className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-700 sm:w-40"
              role="progressbar"
              aria-label="今日写作目标进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <motion.div
                className={`h-full rounded-full transition-[width,background-color] duration-300 ${
                  progress.goalHit ? "bg-emerald-500/80" : "bg-accent-500/70"
                }`}
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: reduceMotion ? 0 : DUR.slow, ease: EASE_STANDARD }}
              />
            </div>
            <span className={progress.goalHit ? "text-emerald-300" : "text-ink-300"}>
              {t("status.dailyGoal")} {progress.wordsAdded}/{progress.goal}
              {progress.goalHit && ` · ${t("common.finish")}`}
            </span>
          </motion.div>
        )}
        {chapterStats && (
          <span
            className="rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1 text-xs font-mono text-ink-300"
            title={t("status.words")}
          >
            中文 {formatNumber(chapterStats.cjk)} · 英文 {formatNumber(chapterStats.en)} · 约
            {formatNumber(chapterStats.tokens)} 预估消耗
          </span>
        )}
        {projectId && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1 bg-ink-800/60 py-1"
            onClick={() => setSummaryOpen(true)}
            title="基于当天字数与最近章节生成今日总结"
          >
            <FileText aria-hidden className="h-3.5 w-3.5" />
            今日总结
          </Button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
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
