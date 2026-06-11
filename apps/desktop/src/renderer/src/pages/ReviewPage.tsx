import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileSearch,
  Info,
  ListChecks,
  Loader2,
  PenLine,
  Play,
  Square,
} from "lucide-react";
import type {
  ChapterRecord,
  OutlineCardRecord,
  ReviewDimensionRecord,
  ReviewReportRecord,
  ReviewSeverity,
} from "@inkforge/shared";
import { chapterApi, fsApi, outlineApi, reviewApi, reviewDimApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { getReviewDimensionHelp } from "../lib/review-dimension-copy";
import { friendlyActionError } from "../lib/friendly-error";
import { ReviewReportPanel } from "../components/review/ReviewReportPanel";

type RangeKind = "book" | "chapter";

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  info: "提示",
  warn: "警告",
  error: "严重",
};

const SEVERITY_HELP: Record<ReviewSeverity, string> = {
  info: "可参考，不一定要改",
  warn: "建议修改，默认级别",
  error: "优先处理，影响连贯性",
};

function reportStatusLabel(status: ReviewReportRecord["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "running") return "运行中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

function rangeLabel(report: ReviewReportRecord): string {
  if (report.rangeKind === "book") return "全书";
  if (report.rangeIds.length === 0) return "选章";
  return `${report.rangeIds.length} 章`;
}

function totalFindings(report: ReviewReportRecord): number {
  const totals = report.summary.totals;
  return totals.error + totals.warn + totals.info;
}

export function ReviewPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const setMainView = useAppStore((s) => s.setMainView);
  const setActiveChapter = useAppStore((s) => s.setChapter);
  const queryClient = useQueryClient();
  const flowActions = useWritingFlowActions();

  const [rangeKind, setRangeKind] = useState<RangeKind>("book");
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const rangeTouchedRef = useRef(false);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [runningReportId, setRunningReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const dimensionsQuery = useQuery({
    queryKey: ["review-dimensions", projectId],
    queryFn: () => (projectId ? reviewDimApi.list({ projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const chaptersQuery = useQuery<ChapterRecord[]>({
    queryKey: ["chapters", projectId],
    queryFn: () => (projectId ? chapterApi.list({ projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const reportsQuery = useQuery({
    queryKey: ["review-reports", projectId],
    queryFn: () => (projectId ? reviewApi.list({ projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });
  const outlineCardsQuery = useQuery<OutlineCardRecord[]>({
    queryKey: ["outline-cards", projectId],
    queryFn: () => (projectId ? outlineApi.list({ projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const dimensions = dimensionsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];
  const enabledDimensions = useMemo(() => dimensions.filter((d) => d.enabled), [dimensions]);
  const activeReport = reports.find((report) => report.id === activeReportId) ?? null;
  const actionChapterId =
    rangeKind === "chapter" && selectedChapterIds.length === 1
      ? selectedChapterIds[0]
      : currentChapterId;
  const actionChapter = chapters.find((chapter) => chapter.id === actionChapterId) ?? null;
  const actionOutlineCard =
    (outlineCardsQuery.data ?? []).find((card) => card.chapterId === actionChapter?.id) ?? null;

  useEffect(() => {
    rangeTouchedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (rangeTouchedRef.current) return;
    if (!currentChapterId) return;
    if (!chapters.some((chapter) => chapter.id === currentChapterId)) return;
    setRangeKind("chapter");
    setSelectedChapterIds([currentChapterId]);
  }, [chapters, currentChapterId]);

  const toggleDimMut = useMutation({
    mutationFn: (dim: ReviewDimensionRecord) =>
      reviewDimApi.upsert({
        id: dim.id,
        projectId: dim.projectId,
        name: dim.name,
        kind: dim.kind,
        builtinId: dim.builtinId,
        skillId: dim.skillId,
        scope: dim.scope,
        severity: dim.severity,
        enabled: !dim.enabled,
        order: dim.order,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["review-dimensions", projectId] }),
  });

  const severityMut = useMutation({
    mutationFn: (input: {
      dim: ReviewDimensionRecord;
      severity: ReviewSeverity;
    }) =>
      reviewDimApi.upsert({
        id: input.dim.id,
        projectId: input.dim.projectId,
        name: input.dim.name,
        kind: input.dim.kind,
        builtinId: input.dim.builtinId,
        skillId: input.dim.skillId,
        scope: input.dim.scope,
        severity: input.severity,
        enabled: input.dim.enabled,
        order: input.dim.order,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["review-dimensions", projectId] }),
  });

  const runMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("没有打开的书籍");
      const rangeIds =
        rangeKind === "chapter" && selectedChapterIds.length > 0
          ? selectedChapterIds
          : undefined;
      return reviewApi.run({
        projectId,
        rangeKind,
        rangeIds,
        dimensionIds: enabledDimensions.map((d) => d.id),
      });
    },
    onSuccess: (res) => {
      setRunningReportId(res.reportId);
      setActiveReportId(res.reportId);
      setStatus("审查已启动。报告会在右侧实时刷新。");
      void queryClient.invalidateQueries({ queryKey: ["review-reports", projectId] });
    },
    onError: (err) => {
      setStatus(friendlyActionError("启动失败", err));
    },
  });

  const cancelMut = useMutation({
    mutationFn: (reportId: string) => reviewApi.cancel({ reportId }),
    onSuccess: () => {
      setStatus("已请求取消当前审查。");
      setRunningReportId(null);
    },
  });

  const exportMut = useMutation({
    mutationFn: async (reportId: string) => {
      const { fileName, content } = await reviewApi.export({ reportId });
      return fsApi.saveFile({
        defaultPath: fileName,
        content,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
    },
    onSuccess: (res) => {
      setStatus(res.path ? `已导出到 ${res.path}` : "已取消导出");
      window.setTimeout(() => setStatus(null), 3000);
    },
    onError: (err) => {
      setStatus(friendlyActionError("导出失败", err));
    },
  });

  const toggleChapter = (id: string) => {
    rangeTouchedRef.current = true;
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleJumpToChapter = (chapterId: string) => {
    setActiveChapter(chapterId);
    setMainView("writing");
  };

  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-950 text-ink-300">
        <div className="max-w-md rounded-md border border-ink-700 bg-ink-900 p-6 text-center">
          <FileSearch className="mx-auto mb-3 h-8 w-8 text-accent-300" />
          <div className="mb-2 text-base font-semibold text-ink-100">全文审查</div>
          <p className="text-sm text-ink-400">请先选择或创建一本书。</p>
        </div>
      </div>
    );
  }

  const canRun =
    enabledDimensions.length > 0 &&
    !runMut.isPending &&
    !runningReportId &&
    (rangeKind === "book" || selectedChapterIds.length > 0);

  return (
    <div className="grid h-full w-full grid-cols-[360px_320px_minmax(0,1fr)] bg-ink-950 text-ink-100">
      <aside className="flex min-h-0 flex-col border-r border-ink-700 bg-ink-900/55">
        <header className="border-b border-ink-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-accent-300" />
            <h2 className="text-sm font-semibold">审查设置</h2>
            <span className="ml-auto text-xs text-ink-500">
              {enabledDimensions.length}/{dimensions.length} 启用
            </span>
          </div>
        </header>

        <section className="border-b border-ink-700 p-3">
          <div className="mb-2 text-xs font-medium text-ink-300">审查范围</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                rangeTouchedRef.current = true;
                setRangeKind("book");
              }}
              className={`h-8 rounded-md border ${
                rangeKind === "book"
                  ? "border-accent-500/50 bg-accent-500/15 text-accent-100"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800"
              }`}
            >
              全书
            </button>
            <button
              type="button"
              onClick={() => {
                rangeTouchedRef.current = true;
                setRangeKind("chapter");
              }}
              className={`h-8 rounded-md border ${
                rangeKind === "chapter"
                  ? "border-accent-500/50 bg-accent-500/15 text-accent-100"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800"
              }`}
            >
              选章
            </button>
          </div>
          {rangeKind === "chapter" ? (
            <div className="mt-2 max-h-44 overflow-auto rounded-md border border-ink-700 bg-ink-950 p-1 scrollbar-thin">
              {chapters.map((chapter) => {
                const selected = selectedChapterIds.includes(chapter.id);
                return (
                  <label
                    key={chapter.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs ${
                      selected ? "bg-accent-500/12 text-accent-100" : "hover:bg-ink-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleChapter(chapter.id)}
                      className="accent-accent-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                    <span className="text-[10px] text-ink-500">{chapter.wordCount}</span>
                  </label>
                );
              })}
              {chapters.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-ink-500">暂无章节</div>
              ) : null}
            </div>
          ) : null}
        </section>

        {actionChapter ? (
          <section className="border-b border-ink-700 p-3 text-xs">
            <div className="mb-2 min-w-0">
              <div className="font-medium text-ink-200">当前处理章节</div>
              <div className="mt-1 truncate text-ink-500" title={actionChapter.title}>
                {actionChapter.title || "未命名章节"} · {actionChapter.wordCount} 字
                {actionOutlineCard ? ` · 已关联大纲卡` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-ink-300 hover:bg-ink-800"
                onClick={() => flowActions.openChapter(actionChapter.id)}
              >
                <BookOpenText className="h-3.5 w-3.5" />
                打开正文
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-ink-300 hover:bg-ink-800"
                onClick={() => flowActions.autoWriteChapter(actionChapter.id)}
              >
                <PenLine className="h-3.5 w-3.5" />
                继续自动写作
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-ink-300 hover:bg-ink-800"
                onClick={() => flowActions.openOutline(actionOutlineCard?.id)}
                title={actionOutlineCard ? `查看大纲卡：${actionOutlineCard.title}` : "回到大纲"}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                回到大纲
              </button>
            </div>
          </section>
        ) : null}

        <section className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <div className="sticky top-0 z-10 border-b border-ink-700 bg-ink-900 px-4 py-2">
            <div className="text-xs font-medium text-ink-300">审查维度</div>
            <div className="mt-0.5 text-[11px] text-ink-500">
              右侧级别表示发现问题时在报告里的标记强度：提示可参考，警告建议改，严重优先处理。
            </div>
          </div>
          <ul className="divide-y divide-ink-700/70">
            {dimensions.map((dim) => (
              <li key={dim.id} className="px-3 py-3">
                <div className="flex items-start gap-2">
                  <input
                    aria-label={`启用 ${dim.name}`}
                    type="checkbox"
                    checked={dim.enabled}
                    onChange={() => toggleDimMut.mutate(dim)}
                    className="mt-0.5 accent-accent-500"
                  />
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-sm text-ink-100">{dim.name}</div>
                    <div className="mt-1 text-[11px] leading-4 text-ink-500">
                      <div>{getReviewDimensionHelp(dim)}</div>
                      <div className="text-ink-400">{SEVERITY_HELP[dim.severity]}</div>
                    </div>
                  </div>
                  <label className="relative">
                    <span className="sr-only">{dim.name} 的报告级别</span>
                    <select
                      value={dim.severity}
                      onChange={(e) =>
                        severityMut.mutate({
                          dim,
                          severity: e.target.value as ReviewSeverity,
                        })
                      }
                      className="h-7 appearance-none rounded-md border border-ink-700 bg-ink-950 pl-2 pr-7 text-xs text-ink-200"
                      title={SEVERITY_HELP[dim.severity]}
                    >
                      <option value="info">提示 · 可参考</option>
                      <option value="warn">警告 · 建议改</option>
                      <option value="error">严重 · 优先处理</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 h-3.5 w-3.5 text-ink-500" />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="space-y-2 border-t border-ink-700 p-3">
          <button
            type="button"
            onClick={() => runMut.mutate()}
            disabled={!canRun}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent-500 text-sm font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-45"
          >
            {runMut.isPending || runningReportId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runningReportId ? "审查运行中" : "开始审查"}
          </button>
          {runningReportId ? (
            <button
              type="button"
              onClick={() => cancelMut.mutate(runningReportId)}
              disabled={cancelMut.isPending}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              取消当前审查
            </button>
          ) : null}
          {status ? <p className="text-[11px] leading-5 text-ink-400">{status}</p> : null}
        </footer>
      </aside>

      <section className="flex min-h-0 flex-col border-r border-ink-700 bg-ink-900/35">
        <header className="border-b border-ink-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-ink-400" />
            <h2 className="text-sm font-semibold">报告历史</h2>
            <span className="ml-auto text-xs text-ink-500">{reports.length} 份</span>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          {reports.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-ink-500">
              还没有报告。配置左侧维度后点击“开始审查”。
            </div>
          ) : (
            <ul className="divide-y divide-ink-700/70">
              {reports.map((report) => {
                const selected = report.id === activeReportId;
                const totals = report.summary.totals;
                return (
                  <li key={report.id}>
                    <button
                      type="button"
                      onClick={() => setActiveReportId(report.id)}
                      className={`w-full px-3 py-3 text-left transition ${
                        selected ? "bg-accent-500/12" : "hover:bg-ink-800/70"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <StatusPill status={report.status} />
                        <span className="ml-auto text-[11px] text-ink-500">
                          {rangeLabel(report)}
                        </span>
                      </div>
                      <div className="text-xs text-ink-200">
                        {new Date(report.startedAt).toLocaleString("zh-CN")}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="text-rose-300">严重 {totals.error}</span>
                        <span className="text-amber-300">警告 {totals.warn}</span>
                        <span className="text-sky-300">提示 {totals.info}</span>
                        <span className="ml-auto text-ink-500">共 {totalFindings(report)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[57px] items-center gap-3 border-b border-ink-700 bg-ink-900/35 px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">发现与修复</div>
            <div className="truncate text-xs text-ink-500">
              {activeReport
                ? `${reportStatusLabel(activeReport.status)} · ${rangeLabel(activeReport)} · ${new Date(activeReport.startedAt).toLocaleString("zh-CN")}`
                : "选择一份报告查看问题列表"}
            </div>
          </div>
          {activeReportId ? (
            <button
              type="button"
              onClick={() => exportMut.mutate(activeReportId)}
              disabled={exportMut.isPending || activeReport?.status === "running"}
              className="flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-xs text-ink-300 hover:bg-ink-800 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              导出
            </button>
          ) : null}
        </header>

        {activeReportId ? (
          <ReviewReportPanel
            reportId={activeReportId}
            dimensions={dimensions}
            chapters={chapters}
            onJumpChapter={handleJumpToChapter}
            onDoneRunning={(id) => {
              if (runningReportId === id) setRunningReportId(null);
            }}
            onExport={(id) => exportMut.mutate(id)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div>
              <FileSearch className="mx-auto mb-3 h-9 w-9 text-ink-600" />
              <div className="mb-1 text-sm font-medium text-ink-300">没有选中的报告</div>
              <p className="text-xs text-ink-500">
                左侧设置审查范围和维度，中间选择历史报告，右侧会显示问题条目和修复入口。
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: ReviewReportRecord["status"] }): JSX.Element {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-accent-500/15 px-1.5 py-0.5 text-[11px] text-accent-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        运行中
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] text-rose-300">
        <AlertTriangle className="h-3 w-3" />
        失败
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">
      <Info className="h-3 w-3" />
      {reportStatusLabel(status)}
    </span>
  );
}
