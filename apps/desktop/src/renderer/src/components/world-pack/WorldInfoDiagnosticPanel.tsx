// =============================================================================
// World Info 激活诊断面板
// =============================================================================
// SillyTavern 一直只往 console.log 写激活情况，作者问"为啥这条没生效"基本靠猜。
// 本面板把每次 activator 跑的完整 trace 可视化：
//   左：最近 N 次激活的简表（场景 + 时间 + 注入数 / 总数）
//   右：选中那次的全部 entries 列表 + 状态徽章（✓注入 / ⊘预算超 / 概率失 / 逻辑失）
//
// 数据来自 world_info_traces 表（v26），通过 worldInfoTraceApi 查询。
// 调用方传 projectId 即可，UI 自己管理选中 + 刷新。
// =============================================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleX, Dices, RefreshCw, Trash2, Wallet, XCircle } from "lucide-react";
import { worldInfoTraceApi } from "../../lib/api";
import type {
  WorldInfoEntryTrace,
  WorldInfoTraceRecord,
} from "@inkforge/shared";

interface Props {
  projectId: string;
}

// 给单条 entry trace 渲染一个状态徽章 + 中文文案。
function StatusBadge({ trace }: { trace: WorldInfoEntryTrace }): JSX.Element {
  if (trace.injected) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-400/30">
        <CheckCircle2 className="h-3 w-3" />
        {trace.constant ? "强制注入" : "已注入"}
      </span>
    );
  }
  if (trace.droppedReason === "budget_exceeded") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] text-orange-300 ring-1 ring-orange-400/30">
        <Wallet className="h-3 w-3" />
        预算超
      </span>
    );
  }
  if (trace.droppedReason === "prob_failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300 ring-1 ring-sky-400/30">
        <Dices className="h-3 w-3" />
        概率失
      </span>
    );
  }
  if (trace.droppedReason === "logic_failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] text-rose-300 ring-1 ring-rose-400/30">
        <CircleX className="h-3 w-3" />
        未命中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300">
      <XCircle className="h-3 w-3" />
      未知
    </span>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export function WorldInfoDiagnosticPanel({ projectId }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const tracesQuery = useQuery({
    queryKey: ["world-info-traces", projectId],
    queryFn: () => worldInfoTraceApi.listRecent({ projectId, limit: 30 }),
    refetchInterval: 5000, // 5 秒轮询，保证刚跑完的激活立刻能看到
  });

  const traces: WorldInfoTraceRecord[] = tracesQuery.data ?? [];
  const selected = traces.find((t) => t.id === selectedTraceId) ?? traces[0] ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-900">
      {/* 左：trace 列表 */}
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-ink-700 bg-ink-950/60">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-3 py-2">
          <span className="text-sm font-medium text-ink-200">激活记录</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => tracesQuery.refetch()}
              title="刷新"
              className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${tracesQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={async () => {
                await worldInfoTraceApi.clear({ projectId });
                queryClient.invalidateQueries({ queryKey: ["world-info-traces", projectId] });
                setSelectedTraceId(null);
              }}
              title="清空所有诊断记录"
              className="rounded p-1 text-ink-400 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {traces.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-500">
              <div className="mb-2 text-2xl opacity-40">📊</div>
              暂无激活记录
              <br />
              触发任何带 World Info 的 AI 操作后会自动出现
            </div>
          ) : (
            traces.map((t) => {
              const injected = t.entries.filter((e) => e.injected).length;
              const total = t.entries.length;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTraceId(t.id)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-ink-800/50 px-3 py-2 text-left text-xs transition ${
                    (selected?.id ?? "") === t.id
                      ? "bg-accent-500/10 text-accent-100"
                      : "text-ink-300 hover:bg-ink-800/50"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium">{t.scene}</span>
                    <span className="text-[10px] text-ink-500">
                      {formatTimestamp(t.createdAt)}
                    </span>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-ink-400">
                    <span>
                      注入 {injected}/{total}
                    </span>
                    <span>
                      {t.charsUsed}/{t.charBudget} 字
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* 右：选中 trace 详情 */}
      <section className="flex flex-1 flex-col overflow-y-auto">
        {selected ? (
          <>
            <div className="border-b border-ink-700 bg-ink-900/40 px-4 py-3">
              <div className="text-sm font-medium text-ink-100">
                {selected.scene} · {formatTimestamp(selected.createdAt)}
              </div>
              <div className="mt-1 text-xs text-ink-400">
                共扫描 {selected.entries.length} 条 · 注入{" "}
                {selected.entries.filter((e) => e.injected).length} 条 · 字符占用{" "}
                {selected.charsUsed}/{selected.charBudget}
              </div>
              {selected.scanTextPreview && (
                <div className="mt-2 line-clamp-2 rounded bg-ink-950/60 px-2 py-1 text-[11px] text-ink-400">
                  扫描文本预览：{selected.scanTextPreview}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selected.entries.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-500">
                  这次激活没有候选条目
                </div>
              ) : (
                <ul className="space-y-2">
                  {selected.entries.map((e) => (
                    <li
                      key={e.entryId}
                      className={`rounded-md border p-2 text-xs ${
                        e.injected
                          ? "border-emerald-400/30 bg-emerald-500/5"
                          : "border-ink-700 bg-ink-900/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <StatusBadge trace={e} />
                            <span className="truncate font-medium text-ink-100">
                              {e.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-500">
                              {e.category}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-400">
                            <span>
                              主命中: {e.matchedKeys.length > 0 ? e.matchedKeys.join("/") : "—"}
                            </span>
                            {e.secondaryMatched.length > 0 && (
                              <span>次命中: {e.secondaryMatched.join("/")}</span>
                            )}
                            <span>逻辑: {e.selectiveLogic}</span>
                            <span>
                              概率: {e.probability}
                              {e.rolled !== null
                                ? ` (掷 ${e.rolled.toFixed(0)})`
                                : ""}
                            </span>
                            <span>预占: {e.approxChars} 字</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-ink-500">
            <div className="text-center">
              <div className="mb-3 text-4xl opacity-30">📊</div>
              从左侧选一条激活记录
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
