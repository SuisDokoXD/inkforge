import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ChapterRecord,
  ReviewApplyFixResponse,
  ReviewDimensionRecord,
  ReviewFindingRecord,
  ReviewProgressEvent,
  ReviewSeverity,
} from "@inkforge/shared";
import { reviewApi } from "../../lib/api";
import { getReviewDimensionHelp } from "../../lib/review-dimension-copy";
import { friendlyErrorMessage } from "../../lib/friendly-error";

interface ReviewReportPanelProps {
  reportId: string;
  dimensions: ReviewDimensionRecord[];
  chapters: ChapterRecord[];
  onJumpChapter: (chapterId: string) => void;
  onDoneRunning: (reportId: string) => void;
  onExport: (reportId: string) => void;
}

function severityMeta(severity: ReviewSeverity): {
  label: string;
  className: string;
  icon: typeof AlertTriangle;
} {
  if (severity === "error") {
    return {
      label: "严重",
      className: "border-rose-500/35 bg-rose-500/8 text-rose-200",
      icon: AlertTriangle,
    };
  }
  if (severity === "info") {
    return {
      label: "提示",
      className: "border-sky-500/35 bg-sky-500/8 text-sky-200",
      icon: Info,
    };
  }
  return {
    label: "警告",
    className: "border-amber-500/35 bg-amber-500/8 text-amber-200",
    icon: AlertTriangle,
  };
}

export function ReviewReportPanel({
  reportId,
  dimensions,
  chapters,
  onJumpChapter,
  onDoneRunning,
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
    for (const finding of findings) {
      const list = map.get(finding.dimensionId) ?? [];
      list.push(finding);
      map.set(finding.dimensionId, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [findings]);

  if (reportQuery.isLoading || !report) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载报告
      </div>
    );
  }

  const progress = progressRef.current;
  const isRunning = report.status === "running";
  const totalChapters = progress?.totalChapters ?? 1;
  const processed = progress?.processedChapters ?? (isRunning ? 0 : totalChapters);
  const percent = Math.min(100, Math.round((processed / Math.max(1, totalChapters)) * 100));
  const totals = report.summary.totals;
  const visibleFindings = findings.filter((finding) => !finding.dismissed);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink-950">
      <div className="border-b border-ink-700 bg-ink-900/35 px-4 py-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <SummaryTile label="严重" value={totals.error} tone="rose" />
          <SummaryTile label="警告" value={totals.warn} tone="amber" />
          <SummaryTile label="提示" value={totals.info} tone="sky" />
        </div>
        {isRunning ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-400">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-accent-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span>
              {processed}/{totalChapters} 章 · 已发现 {progress?.partialFindings ?? 0}
            </span>
          </div>
        ) : null}
        {report.status === "failed" && report.error ? (
          <div className="mt-3 rounded-md border border-rose-500/35 bg-rose-500/8 px-3 py-2 text-xs text-rose-200">
            审查失败：{friendlyErrorMessage(report.error, "审查服务暂时不可用，请稍后重试。")}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        {groupedByDimension.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              {isRunning ? (
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-accent-300" />
              ) : (
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
              )}
              <div className="mb-1 text-sm font-medium text-ink-300">
                {isRunning ? "正在审查" : "没有发现问题"}
              </div>
              <p className="text-xs text-ink-500">
                {isRunning
                  ? "报告完成后会按维度展示问题条目。"
                  : "当前报告没有产生问题条目，可以调整维度后重新运行。"}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-3 text-xs text-ink-500">
              显示 {visibleFindings.length} 条未忽略问题，已忽略的条目会变淡保留。
            </div>
            <div className="space-y-3">
              {groupedByDimension.map(([dimensionId, list]) => {
                const dim = dimensionById.get(dimensionId);
                return (
                  <section
                    key={dimensionId}
                    className="rounded-md border border-ink-700 bg-ink-900/35"
                  >
                    <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-100">
                          {dim?.name ?? dimensionId}
                        </div>
                        <div className="text-[11px] leading-4 text-ink-500">
                          {getReviewDimensionHelp(dim)}
                        </div>
                      </div>
                      <span className="rounded bg-ink-950 px-2 py-0.5 text-xs text-ink-400">
                        {list.length}
                      </span>
                    </header>
                    <ul className="divide-y divide-ink-700/70">
                      {list.map((finding) => (
                        <FindingRow
                          key={finding.id}
                          finding={finding}
                          chapter={finding.chapterId ? chapterById.get(finding.chapterId) : undefined}
                          onJumpChapter={onJumpChapter}
                          onToggleDismiss={() =>
                            dismissMut.mutate({
                              findingId: finding.id,
                              dismissed: !finding.dismissed,
                            })
                          }
                          onPreviewFix={() => previewMut.mutate(finding.id)}
                          fixing={previewMut.isPending && previewMut.variables === finding.id}
                          disabled={dismissMut.isPending || previewMut.isPending || applyMut.isPending}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {fixPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onMouseDown={() => setFixPreview(null)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-ink-700 bg-ink-900 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-100">修复预览</h2>
                <p className="text-xs text-ink-500">确认后才会写回原章节。</p>
              </div>
              <button
                type="button"
                onClick={() => setFixPreview(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                aria-label="关闭修复预览"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto p-4">
              <PreviewBlock title="原文片段" text={fixPreview.response.originalExcerpt} />
              <PreviewBlock title="修订建议" text={fixPreview.response.patchedExcerpt} accent />
            </div>
            <footer className="flex items-center justify-between gap-2 border-t border-ink-700 px-4 py-3 text-xs">
              <span className="text-ink-500">
                {fixPreview.response.range
                  ? `位置 ${fixPreview.response.range.start} - ${fixPreview.response.range.end}`
                  : "未定位到可写回范围"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFixPreview(null)}
                  className="h-8 rounded-md px-3 text-ink-300 hover:bg-ink-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => previewMut.mutate(fixPreview.findingId)}
                  disabled={previewMut.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-3 text-ink-200 hover:bg-ink-800 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  重新生成
                </button>
                <button
                  type="button"
                  onClick={() => applyMut.mutate(fixPreview.findingId)}
                  disabled={applyMut.isPending || !fixPreview.response.range}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-500 px-3 font-medium text-ink-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {applyMut.isPending ? "写入中" : "应用到原文"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "sky";
}): JSX.Element {
  const toneClass =
    tone === "rose"
      ? "text-rose-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-sky-300";
  return (
    <div className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FindingRow({
  finding,
  chapter,
  onJumpChapter,
  onToggleDismiss,
  onPreviewFix,
  fixing,
  disabled,
}: {
  finding: ReviewFindingRecord;
  chapter?: ChapterRecord;
  onJumpChapter: (chapterId: string) => void;
  onToggleDismiss: () => void;
  onPreviewFix: () => void;
  fixing: boolean;
  disabled: boolean;
}): JSX.Element {
  const meta = severityMeta(finding.severity);
  const Icon = meta.icon;
  const canFix =
    !!finding.suggestion &&
    !!finding.chapterId &&
    finding.excerptStart != null &&
    finding.excerptEnd != null;

  return (
    <li className={`p-3 ${finding.dismissed ? "opacity-45" : ""}`}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${meta.className}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {chapter ? (
          <button
            type="button"
            onClick={() => onJumpChapter(chapter.id)}
            className="inline-flex min-w-0 items-center gap-1 text-ink-300 hover:text-accent-200"
          >
            <span className="truncate">{chapter.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        ) : (
          <span className="text-ink-500">全书范围</span>
        )}
        <span className="ml-auto text-[11px] text-ink-500">
          {new Date(finding.createdAt).toLocaleTimeString("zh-CN")}
        </span>
      </div>
      {finding.excerpt ? (
        <blockquote className="mb-2 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs leading-5 text-ink-200">
          {finding.excerpt}
        </blockquote>
      ) : null}
      {finding.suggestion ? (
        <p className="text-xs leading-5 text-ink-200">{finding.suggestion}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDismiss}
          disabled={disabled}
          className="h-7 rounded-md border border-ink-700 px-2 text-xs text-ink-300 hover:bg-ink-800 disabled:opacity-50"
        >
          {finding.dismissed ? "恢复" : "忽略"}
        </button>
        {canFix ? (
          <button
            type="button"
            onClick={onPreviewFix}
            disabled={disabled || finding.dismissed}
            className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            修复
          </button>
        ) : null}
      </div>
    </li>
  );
}

function PreviewBlock({
  title,
  text,
  accent = false,
}: {
  title: string;
  text: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="min-h-0">
      <div className={`mb-1 text-xs ${accent ? "text-emerald-300" : "text-ink-400"}`}>
        {title}
      </div>
      <pre
        className={`max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-md border p-3 text-xs leading-5 scrollbar-thin ${
          accent
            ? "border-emerald-500/35 bg-emerald-500/8 text-ink-100"
            : "border-ink-700 bg-ink-950 text-ink-200"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}
