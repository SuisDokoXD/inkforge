import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dailyApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
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

  return (
    <footer className="flex items-center justify-between border-t border-ink-700 bg-ink-800/60 px-4 py-1 text-xs text-ink-400">
      <div className="flex items-center gap-3">
        <span>InkForge · 墨炉</span>
        {progress && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink-700">
              <div
                className={`h-full rounded-full transition-all ${
                  progress.goalHit ? "bg-green-400" : "bg-accent-400"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className={progress.goalHit ? "text-green-300" : "text-ink-300"}>
              {t("status.dailyGoal")} {progress.wordsAdded}/{progress.goal}
              {progress.goalHit && ` · ${t("common.finish")}`}
            </span>
          </div>
        )}
        {chapterStats && (
          <span
            className="rounded border border-ink-700/70 bg-ink-900/60 px-2 py-0.5 font-mono text-[11px] text-ink-300"
            title={t("status.words")}
          >
            CN {formatNumber(chapterStats.cjk)} · EN {formatNumber(chapterStats.en)} · ~
            {formatNumber(chapterStats.tokens)} tok
          </span>
        )}
        {projectId && (
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="rounded border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
            title="基于当天字数与最近章节生成 AI 日报"
          >
            📝 今日总结
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {analysisStatus === "streaming" && t("common.loading")}
        {analysisStatus === "failed" && `${t("error.generic")}: ${analysisError ?? "unknown"}`}
        {(analysisStatus === null || analysisStatus === "completed") && "AI · ready"}
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
