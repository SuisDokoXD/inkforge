import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterRecord,
  ReviewApplyFixResponse,
  ReviewDimensionRecord,
  ReviewFindingRecord,
  ReviewProgressEvent,
} from "@inkforge/shared";
import { reviewApi } from "../../lib/api";

interface ReviewReportPanelProps {
  reportId: string;
  dimensions: ReviewDimensionRecord[];
  chapters: ChapterRecord[];
  onJumpChapter: (chapterId: string) => void;
  onDoneRunning: (reportId: string) => void;
  onExport: (reportId: string) => void;
}

function severityBadge(severity: string): { color: string; icon: string } {
  if (severity === "error") {
    return { color: "bg-red-500/20 text-red-200 border-red-500/50", icon: "❗" };
  }
  if (severity === "info") {
    return { color: "bg-sky-500/20 text-sky-200 border-sky-500/40", icon: "ℹ" };
  }
  return { color: "bg-amber-500/20 text-amber-200 border-amber-500/50", icon: "⚠" };
}

export function ReviewReportPanel({
  reportId,
  dimensions,
  chapters,
  onJumpChapter,
  onDoneRunning,
  onExport,
}: ReviewReportPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const progressRef = useRef<ReviewProgressEvent | null>(null);

  const reportQuery = useQuery({
    queryKey: ["review-report", reportId],
    queryFn: () => reviewApi.get({ reportId }),
    refetchInterval: 4000,
  });

  useEffect(() => {
    const offProgress = reviewApi.onProgress((event) => {
      if (event.reportId !== reportId) return;
      progressRef.current = event;
      void queryClient.invalidateQueries({ queryKey: ["review-report", reportId] });
    });
    const offDone = reviewApi.onDone((event) => {
      if (event.reportId !== reportId) return;
      onDoneRunning(event.reportId);
      progressRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["review-report", reportId] });
      void queryClient.invalidateQueries({ queryKey: ["review-reports"] });
    });
    return () => {
      offProgress?.();
      offDone?.();
    };
  }, [reportId, queryClient, onDoneRunning]);

  const dismissMut = useMutation({
    mutationFn: (input: { findingId: string; dismissed: boolean }) =>
      reviewApi.dismissFinding(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["review-report", reportId] }),
  });

  // —— Audit→Fix：preview/apply 两步 ——
  // 流程：点击"修复"→ 调用 review.applyFix({mode:"preview"})→ 展示对照 →
  //       用户点"应用"再调用 mode:"apply" 写盘。
  const [fixPreview, setFixPreview] = useState<{
    findingId: string;
    response: ReviewApplyFixResponse;
  } | null>(null);
  const previewMut = useMutation({
    mutationFn: (findingId: string) =>
      reviewApi.applyFix({ findingId, mode: "preview" }),
    onSuccess: (res, findingId) => {
      setFixPreview({ findingId, response: res });
    },
  });
  const applyMut = useMutation({
    mutationFn: (findingId: string) =>
      reviewApi.applyFix({ findingId, mode: "apply" }),
    onSuccess: () => {
      setFixPreview(null);
      queryClient.invalidateQueries({ queryKey: ["review-report", reportId] });
    },
  });

  const data = reportQuery.data ?? null;
  const report = data?.report ?? null;
  const findings = data?.findings ?? [];

  const dimensionById = useMemo(() => {
    const map = new Map<string, ReviewDimensionRecord>();
    for (const d of dimensions) map.set(d.id, d);
    return map;
  }, [dimensions]);

  const chapterById = useMemo(() => {
    const map = new Map<string, ChapterRecord>();
    for (const c of chapters) map.set(c.id, c);
    return map;
  }, [chapters]);

  const groupedByDimension = useMemo(() => {
    const map = new Map<string, ReviewFindingRecord[]>();
    for (const f of findings) {
      const list = map.get(f.dimensionId) ?? [];
      list.push(f);
      map.set(f.dimensionId, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [findings]);

  if (reportQuery.isLoading || !report) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-ink-400">
        加载中…
      </div>
    );
  }

  const progress = progressRef.current;
  const isRunning = report.status === "running";
  const totalChapters = progress?.totalChapters ?? 1;
  const processed = progress?.processedChapters ?? (isRunning ? 0 : totalChapters);
  const percent = Math.min(100, Math.round((processed / Math.max(1, totalChapters)) * 100));
  const totals = report.summary.totals;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-ink-700 bg-ink-800/30 px-4 py-3">
        <div className="flex items-center justify-between gap-4 text-xs text-ink-400">
          <div>
            开始：{new Date(report.startedAt).toLocaleString("zh-CN")}
            {report.finishedAt && (
              <>
                {" · "}
                完成：{new Date(report.finishedAt).toLocaleString("zh-CN")}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-red-500/15 px-2 py-[1px] text-red-200">
              ❗ {totals.error}
            </span>
            <span className="rounded bg-amber-500/15 px-2 py-[1px] text-amber-200">
              ⚠ {totals.warn}
            </span>
            <span className="rounded bg-sky-500/15 px-2 py-[1px] text-sky-200">
              ℹ {totals.info}
            </span>
            <button
              type="button"
              onClick={() => onExport(report.id)}
              disabled={isRunning}
              className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-ink-700 disabled:opacity-50"
            >
              导出 Markdown
            </button>
          </div>
        </div>
        {isRunning && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
            <div className="h-1.5 flex-1 rounded-full bg-ink-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span>
              {processed}/{totalChapters} 章 · 已累计 {progress?.partialFindings ?? 0} 条
            </span>
          </div>
        )}
        {report.status === "failed" && report.error && (
          <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            审查失败：{report.error}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {groupedByDimension.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-400">
            {isRunning ? "正在执行…" : "本报告未产出 findings"}
          </div>
        )}
        {groupedByDimension.map(([dimensionId, list]) => {
          const dim = dimensionById.get(dimensionId);
          return (
            <details
              key={dimensionId}
              open
              className="border-b border-ink-700/60 px-4 py-3"
            >
              <summary className="flex cursor-pointer items-center gap-2 text-sm text-ink-100">
                <span>{dim?.name ?? dimensionId}</span>
                <span className="rounded bg-ink-800 px-1.5 py-[1px] text-[10px] text-ink-400">
                  {list.length}
                </span>
                {dim?.kind === "builtin" && (
                  <span className="text-[10px] text-ink-500">
                    {dim.builtinId}
                  </span>
                )}
              </summary>
              <ul className="mt-2 space-y-2">
                {list.map((finding) => {
                  const badge = severityBadge(finding.severity);
                  const chapter = finding.chapterId
                    ? chapterById.get(finding.chapterId)
                    : undefined;
                  return (
                    <li
                      key={finding.id}
                      className={`rounded border px-3 py-2 ${badge.color} ${
                        finding.dismissed ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span>{badge.icon}</span>
                        {chapter && (
                          <button
                            type="button"
                            onClick={() => onJumpChapter(chapter.id)}
                            className="truncate text-ink-200 hover:underline"
                          >
                            《{chapter.title}》
                          </button>
                        )}
                        <span className="ml-auto text-ink-400">
                          {new Date(finding.createdAt).toLocaleTimeString("zh-CN")}
                        </span>
                      </div>
                      {finding.excerpt && (
                        <blockquote className="mt-1 rounded bg-black/20 px-2 py-1 text-[12px] text-ink-100">
                          {finding.excerpt}
                        </blockquote>
                      )}
                      {finding.suggestion && (
                        <p className="mt-1 text-[12px] leading-5 text-ink-100">
                          {finding.suggestion}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            dismissMut.mutate({
                              findingId: finding.id,
                              dismissed: !finding.dismissed,
                            })
                          }
                          disabled={dismissMut.isPending}
                          className="rounded border border-ink-600 px-2 py-0.5 text-ink-200 hover:bg-ink-700/40"
                        >
                          {finding.dismissed ? "取消忽略" : "忽略"}
                        </button>
                        {/* 仅当存在 suggestion + 章节定位时才显示"修复" */}
                        {finding.suggestion &&
                          finding.chapterId &&
                          finding.excerptStart != null &&
                          finding.excerptEnd != null && (
                            <button
                              type="button"
                              onClick={() => previewMut.mutate(finding.id)}
                              disabled={
                                previewMut.isPending ||
                                applyMut.isPending ||
                                finding.dismissed
                              }
                              className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                              title="让 AI 按建议改写选段并预览"
                            >
                              {previewMut.isPending &&
                              previewMut.variables === finding.id
                                ? "生成中…"
                                : "修复"}
                            </button>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
      {/* Fix 预览对话框：preview 成功后弹出，对照原文与 AI 修订，让用户决定是否落盘 */}
      {fixPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setFixPreview(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-950/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-100">修订预览</h2>
              <button
                onClick={() => setFixPreview(null)}
                className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
              >
                ✕
              </button>
            </header>
            <div className="grid flex-1 grid-cols-2 gap-3 overflow-auto p-4">
              <div>
                <div className="mb-1 text-[11px] text-ink-400">原文片段</div>
                <pre className="whitespace-pre-wrap rounded border border-ink-700 bg-ink-950/50 p-2 text-[12px] leading-5 text-ink-200">
                  {fixPreview.response.originalExcerpt}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-emerald-300">AI 修订</div>
                <pre className="whitespace-pre-wrap rounded border border-emerald-500/40 bg-emerald-500/5 p-2 text-[12px] leading-5 text-ink-100">
                  {fixPreview.response.patchedExcerpt}
                </pre>
              </div>
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-700 bg-ink-950/60 px-4 py-3 text-xs">
              <span className="text-ink-400">
                {fixPreview.response.range
                  ? `位置：${fixPreview.response.range.start} – ${fixPreview.response.range.end}`
                  : "未定位精确范围（无法落盘）"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setFixPreview(null)}
                  className="rounded px-3 py-1.5 text-ink-300 hover:bg-ink-800"
                >
                  取消
                </button>
                <button
                  onClick={() => previewMut.mutate(fixPreview.findingId)}
                  disabled={previewMut.isPending}
                  className="rounded border border-ink-600 px-3 py-1.5 text-ink-200 hover:bg-ink-700/40 disabled:opacity-50"
                  title="让 AI 再生成一次"
                >
                  重新生成
                </button>
                <button
                  onClick={() => applyMut.mutate(fixPreview.findingId)}
                  disabled={
                    applyMut.isPending || !fixPreview.response.range
                  }
                  className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-ink-900 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {applyMut.isPending ? "写入中…" : "应用到原文"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
