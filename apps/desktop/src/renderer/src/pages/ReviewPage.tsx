import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterRecord,
  ReviewDimensionRecord,
  ReviewReportRecord,
} from "@inkforge/shared";
import { chapterApi, fsApi, reviewApi, reviewDimApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { ReviewReportPanel } from "../components/review/ReviewReportPanel";

type RangeKind = "book" | "chapter";

export function ReviewPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const setMainView = useAppStore((s) => s.setMainView);
  const setActiveChapter = useAppStore((s) => s.setChapter);
  const queryClient = useQueryClient();

  const [rangeKind, setRangeKind] = useState<RangeKind>("book");
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [runningReportId, setRunningReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const dimensionsQuery = useQuery({
    queryKey: ["review-dimensions", projectId],
    queryFn: () =>
      projectId ? reviewDimApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const chaptersQuery = useQuery<ChapterRecord[]>({
    queryKey: ["chapters", projectId],
    queryFn: () =>
      projectId ? chapterApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const reportsQuery = useQuery({
    queryKey: ["review-reports", projectId],
    queryFn: () =>
      projectId ? reviewApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const dimensions = dimensionsQuery.data ?? [];
  const enabledDimensions = useMemo(
    () => dimensions.filter((d) => d.enabled),
    [dimensions],
  );

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
      severity: "info" | "warn" | "error";
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
      if (!projectId) throw new Error("no_project");
      const rangeIds =
        rangeKind === "chapter" && selectedChapterIds.length > 0
          ? selectedChapterIds
          : undefined;
      return reviewApi.run({
        projectId,
        rangeKind: rangeKind === "chapter" ? "chapter" : "book",
        rangeIds,
        dimensionIds: enabledDimensions.map((d) => d.id),
      });
    },
    onSuccess: (res) => {
      setRunningReportId(res.reportId);
      setActiveReportId(res.reportId);
      setStatus("审查已启动…");
      void queryClient.invalidateQueries({ queryKey: ["review-reports", projectId] });
    },
    onError: (err) => {
      setStatus(`启动失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const cancelMut = useMutation({
    mutationFn: (reportId: string) => reviewApi.cancel({ reportId }),
    onSuccess: () => {
      setStatus("已请求取消");
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
      setStatus(res.path ? `已导出至 ${res.path}` : "已取消导出");
      window.setTimeout(() => setStatus(null), 3000);
    },
    onError: (err) => {
      setStatus(err instanceof Error ? err.message : String(err));
    },
  });

  const toggleChapter = (id: string) => {
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
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">📊 全文审查</div>
          <p className="text-sm">请先在侧边栏选择或创建一个项目。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-ink-900">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-ink-700 bg-ink-800/40">
        <div className="border-b border-ink-700 px-3 py-2 text-sm font-medium text-accent-300">
          审查维度
          <span className="ml-2 text-[11px] text-ink-500">
            {enabledDimensions.length}/{dimensions.length} 启用
          </span>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {dimensions.length === 0 && (
            <div className="p-6 text-center text-xs text-ink-500">
              首次打开自动创建 5 个 builtin 维度。
            </div>
          )}
          <ul className="divide-y divide-ink-700/60">
            {dimensions.map((dim) => (
              <li key={dim.id} className="px-3 py-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dim.enabled}
                    onChange={() => toggleDimMut.mutate(dim)}
                    className="accent-accent-500"
                  />
                  <span className="flex-1 text-ink-100">{dim.name}</span>
                  <select
                    value={dim.severity}
                    onChange={(e) =>
                      severityMut.mutate({
                        dim,
                        severity: e.target.value as "info" | "warn" | "error",
                      })
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[10px] text-ink-200"
                  >
                    <option value="info">提示</option>
                    <option value="warn">警告</option>
                    <option value="error">错误</option>
                  </select>
                </label>
                <div className="mt-0.5 pl-6 text-[10px] text-ink-500">
                  {dim.kind === "builtin"
                    ? `builtin · ${dim.builtinId}`
                    : "Skill 维度（暂不执行）"}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-ink-700 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-ink-400">范围：</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="review-range"
                checked={rangeKind === "book"}
                onChange={() => setRangeKind("book")}
                className="accent-accent-500"
              />
              <span>全书</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="review-range"
                checked={rangeKind === "chapter"}
                onChange={() => setRangeKind("chapter")}
                className="accent-accent-500"
              />
              <span>选章</span>
            </label>
          </div>
          {rangeKind === "chapter" && (
            <div className="max-h-40 overflow-auto scrollbar-thin rounded border border-ink-700 bg-ink-900/40 p-1">
              {(chaptersQuery.data ?? []).map((chapter) => {
                const selected = selectedChapterIds.includes(chapter.id);
                return (
                  <label
                    key={chapter.id}
                    className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer ${
                      selected ? "bg-accent-500/10" : "hover:bg-ink-700/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleChapter(chapter.id)}
                      className="accent-accent-500"
                    />
                    <span className="truncate text-ink-100">{chapter.title}</span>
                    <span className="ml-auto text-[10px] text-ink-500">
                      {chapter.wordCount}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => runMut.mutate()}
            disabled={
              enabledDimensions.length === 0 ||
              runMut.isPending ||
              !!runningReportId ||
              (rangeKind === "chapter" && selectedChapterIds.length === 0)
            }
            className="w-full rounded bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {runMut.isPending ? "启动中…" : runningReportId ? "运行中…" : "🚀 开始审查"}
          </button>
          {runningReportId && (
            <button
              type="button"
              onClick={() => cancelMut.mutate(runningReportId)}
              disabled={cancelMut.isPending}
              className="w-full rounded border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20"
            >
              取消当前审查
            </button>
          )}
          {status && <p className="text-[11px] text-ink-400">{status}</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-ink-700 bg-ink-800/40 px-4 py-2 text-xs text-ink-400">
          报告列表 · 共 {(reportsQuery.data ?? []).length} 份
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-[260px] shrink-0 overflow-auto scrollbar-thin border-r border-ink-700">
            {(reportsQuery.data ?? []).map((report: ReviewReportRecord) => {
              const selected = report.id === activeReportId;
              const totals = report.summary.totals;
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setActiveReportId(report.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-ink-700/60 px-3 py-2 text-left text-xs transition ${
                    selected ? "bg-ink-700/60" : "hover:bg-ink-700/20"
                  }`}
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="text-ink-100">
                      {new Date(report.startedAt).toLocaleString("zh-CN")}
                    </span>
                    <span
                      className={`ml-auto rounded px-1.5 py-[1px] text-[10px] ${
                        report.status === "completed"
                          ? "bg-green-500/20 text-green-300"
                          : report.status === "running"
                            ? "bg-accent-500/20 text-accent-300"
                            : report.status === "failed"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-ink-700 text-ink-300"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>
                  <div className="text-ink-500">
                    {report.rangeKind === "book" ? "全书" : `${report.rangeIds.length} 章`}
                  </div>
                  <div className="text-ink-400">
                    ❗ {totals.error} · ⚠ {totals.warn} · ℹ {totals.info}
                  </div>
                </button>
              );
            })}
            {(reportsQuery.data ?? []).length === 0 && (
              <div className="p-4 text-center text-xs text-ink-500">
                没有历史报告。
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {activeReportId ? (
              <ReviewReportPanel
                reportId={activeReportId}
                dimensions={dimensions}
                chapters={chaptersQuery.data ?? []}
                onJumpChapter={handleJumpToChapter}
                onDoneRunning={(id) => {
                  if (runningReportId === id) setRunningReportId(null);
                }}
                onExport={(id) => exportMut.mutate(id)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-ink-400">
                选择左侧的报告查看 findings
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
