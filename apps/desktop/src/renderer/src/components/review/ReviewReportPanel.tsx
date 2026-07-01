import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
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
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";
import { reviewApi } from "../../lib/api";
import { getReviewDimensionHelp } from "../../lib/review-dimension-copy";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  DUR,
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { Badge } from "../ui";

interface ReviewReportPanelProps {
  reportId: string;
  dimensions: ReviewDimensionRecord[];
  chapters: ChapterRecord[];
  // A2: excerpt 参数用于滚动到编辑器中对应位置
  onJumpChapter: (chapterId: string, excerpt?: string) => void;
  onDoneRunning: (reportId: string) => void;
}

function severityMeta(severity: ReviewSeverity): {
  label: string;
  tone: "warning" | "danger" | "accent";
  icon: typeof AlertTriangle;
} {
  if (severity === "error") {
    return {
      label: "严重",
      tone: "danger",
      icon: AlertTriangle,
    };
  }
  if (severity === "info") {
    return {
      label: "提示",
      tone: "accent",
      icon: Info,
    };
  }
  return {
    label: "警告",
    tone: "warning",
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
  const reduce = useReducedMotion();
  const stateMotion = reduce ? fadeOnly : fadeSlideUp;
  const interactiveMotion = reduce
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const progressRef = useRef<ReviewProgressEvent | null>(null);
  const fixPreviewCloseTimerRef = useRef<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["review-report", reportId] }),
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "问题状态更新失败，请稍后重试。"));
    },
  });

  const [fixPreview, setFixPreview] = useState<{
    findingId: string;
    response: ReviewApplyFixResponse;
  } | null>(null);
  const [fixPreviewOpen, setFixPreviewOpen] = useState(false);

  const clearFixPreviewCloseTimer = (): void => {
    if (fixPreviewCloseTimerRef.current !== null) {
      window.clearTimeout(fixPreviewCloseTimerRef.current);
      fixPreviewCloseTimerRef.current = null;
    }
  };

  useEffect(() => clearFixPreviewCloseTimer, []);

  function closeFixPreview(): void {
    clearFixPreviewCloseTimer();
    setFixPreviewOpen(false);
    fixPreviewCloseTimerRef.current = window.setTimeout(() => {
      fixPreviewCloseTimerRef.current = null;
      setFixPreview(null);
    }, DUR.fast * 1000);
  }

  const previewMut = useMutation({
    mutationFn: (findingId: string) =>
      reviewApi.applyFix({ findingId, mode: "preview" }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: (res, findingId) => {
      clearFixPreviewCloseTimer();
      setFixPreview({ findingId, response: res });
      setFixPreviewOpen(true);
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "修复预览生成失败，请稍后重试。"));
    },
  });

  const applyMut = useMutation({
    mutationFn: (findingId: string) =>
      reviewApi.applyFix({ findingId, mode: "apply" }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      closeFixPreview();
      queryClient.invalidateQueries({ queryKey: ["review-report", reportId] });
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "修复写入失败，请稍后重试。"));
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
        <MotionSpinner className="h-4 w-4" />
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
        <motion.div
          className="grid grid-cols-3 gap-2 text-xs"
          variants={reduce ? undefined : staggerContainer}
          initial="initial"
          animate="animate"
        >
          <SummaryTile label="严重" value={totals.error} tone="rose" />
          <SummaryTile label="警告" value={totals.warn} tone="amber" />
          <SummaryTile label="提示" value={totals.info} tone="sky" />
        </motion.div>
        {isRunning ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-400">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
              <motion.div
                className="h-full rounded-full bg-accent-400 transition-[width] duration-300"
                initial={false}
                animate={{ width: `${percent}%` }}
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
        <AnimatePresence initial={false}>
          {actionError ? (
            <motion.div
              className="mt-3 flex items-center justify-between gap-3 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100"
              role="alert"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <span>{actionError}</span>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-0.5 hover:bg-red-500/20"
                onClick={() => setActionError(null)}
              >
                知道了
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        {groupedByDimension.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              {isRunning ? (
                <MotionSpinner className="mx-auto mb-3 h-8 w-8 text-accent-300" />
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
            <motion.div
              className="space-y-3"
              variants={reduce ? undefined : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {groupedByDimension.map(([dimensionId, list]) => {
                const dim = dimensionById.get(dimensionId);
                return (
                  <motion.section
                    key={dimensionId}
                    className="rounded-md border border-ink-700 bg-ink-900/35"
                    variants={reduce ? fadeOnly : staggerItem}
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
                      <Badge
                        tone="neutral"
                        size="md"
                        className="bg-ink-950 px-2 text-ink-400 ring-ink-700"
                      >
                        {list.length}
                      </Badge>
                    </header>
                    <motion.ul
                      className="divide-y divide-ink-700/70"
                      variants={reduce ? undefined : staggerContainer}
                      initial="initial"
                      animate="animate"
                    >
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
                    </motion.ul>
                  </motion.section>
                );
              })}
            </motion.div>
          </div>
        )}
      </div>

      {fixPreview ? (
        <AnimatedDialog
          open={fixPreviewOpen}
          onClose={closeFixPreview}
          labelledBy="review-fix-preview-title"
          overlayClassName="flex items-center justify-center p-4"
          panelClassName="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-ink-700 bg-ink-900 shadow-2xl"
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            variants={stateMotion}
            initial="initial"
            animate="animate"
          >
            <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <div>
                <h2 id="review-fix-preview-title" className="text-sm font-semibold text-ink-100">
                  修复预览
                </h2>
                <p className="text-xs text-ink-500">确认后才会写回原章节。</p>
              </div>
              <motion.button
                type="button"
                onClick={closeFixPreview}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                aria-label="关闭修复预览"
                title="关闭"
                {...interactiveMotion}
              >
                <X aria-hidden className="h-4 w-4" />
              </motion.button>
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
                <motion.button
                  type="button"
                  onClick={closeFixPreview}
                  className="h-8 rounded-md px-3 text-ink-300 hover:bg-ink-800"
                  {...interactiveMotion}
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => previewMut.mutate(fixPreview.findingId)}
                  disabled={previewMut.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-3 text-ink-200 hover:bg-ink-800 disabled:cursor-default disabled:opacity-50"
                  {...(previewMut.isPending ? {} : interactiveMotion)}
                >
                  <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                  重新生成
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => applyMut.mutate(fixPreview.findingId)}
                  disabled={applyMut.isPending || !fixPreview.response.range}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-500 px-3 font-medium text-ink-950 hover:bg-emerald-400 disabled:cursor-default disabled:opacity-50"
                  {...(applyMut.isPending || !fixPreview.response.range ? {} : interactiveMotion)}
                >
                  <Check aria-hidden className="h-3.5 w-3.5" />
                  {applyMut.isPending ? "写入中" : "应用到原文"}
                </motion.button>
              </div>
            </footer>
          </motion.div>
        </AnimatedDialog>
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
  // A2: excerpt 参数用于滚动到编辑器中对应位置
  onJumpChapter: (chapterId: string, excerpt?: string) => void;
  onToggleDismiss: () => void;
  onPreviewFix: () => void;
  fixing: boolean;
  disabled: boolean;
}): JSX.Element {
  const reduce = useReducedMotion() === true;
  const rowMotion = reduce ? fadeOnly : staggerItem;
  const buttonMotion = reduce
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const meta = severityMeta(finding.severity);
  const Icon = meta.icon;
  const canFix =
    !!finding.suggestion &&
    !!finding.chapterId &&
    finding.excerptStart != null &&
    finding.excerptEnd != null;

  return (
    <motion.li
      layout
      variants={rowMotion}
      className={`p-3 ${finding.dismissed ? "opacity-45" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <Badge tone={meta.tone} className="gap-1 rounded-md px-1.5">
          <Icon aria-hidden className="h-3 w-3" />
          {meta.label}
        </Badge>
        {chapter ? (
          <motion.button
            type="button"
            // A2: 点击跳转时附带摘录文本，EditorPane 会自动滚动定位
            onClick={() => onJumpChapter(chapter.id, finding.excerpt)}
            className="inline-flex min-w-0 items-center gap-1 text-ink-300 hover:text-accent-200"
            aria-label={`跳转到章节：${chapter.title}`}
            title={`跳转到章节：${chapter.title}`}
            {...buttonMotion}
          >
            <span className="truncate">{chapter.title}</span>
            <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
          </motion.button>
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
        <motion.button
          type="button"
          onClick={onToggleDismiss}
          disabled={disabled}
          className="h-7 rounded-md border border-ink-700 px-2 text-xs text-ink-300 hover:bg-ink-800 disabled:cursor-default disabled:opacity-50"
          {...(disabled ? {} : buttonMotion)}
        >
          {finding.dismissed ? "恢复" : "忽略"}
        </motion.button>
        {canFix ? (
          <motion.button
            type="button"
            onClick={onPreviewFix}
            disabled={disabled || finding.dismissed}
            className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-default disabled:opacity-50"
            {...(disabled || finding.dismissed ? {} : buttonMotion)}
          >
            {fixing ? (
              <MotionSpinner className="h-3.5 w-3.5" />
            ) : (
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
            )}
            修复
          </motion.button>
        ) : null}
      </div>
    </motion.li>
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
