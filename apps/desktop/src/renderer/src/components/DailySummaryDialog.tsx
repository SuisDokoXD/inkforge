import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dailySummaryApi } from "../lib/api";

interface DailySummaryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DailySummaryDialog({
  open,
  onClose,
  projectId,
}: DailySummaryDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string>(todayKey());
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const activeSummaryIdRef = useRef<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["daily-summary", projectId, date],
    queryFn: () => dailySummaryApi.get({ projectId, date }),
    enabled: open && !!projectId && !!date,
  });

  const generateMut = useMutation({
    mutationFn: () => dailySummaryApi.generate({ projectId, date }),
    onSuccess: (res) => {
      activeSummaryIdRef.current = res.summaryId;
      setStreaming("");
      setStatus("生成中…");
    },
    onError: (err) => {
      setStatus(
        `启动失败：${err instanceof Error ? err.message : String(err)}`,
      );
      setStreaming(null);
    },
  });

  useEffect(() => {
    if (!open) return;
    const offChunk = dailySummaryApi.onChunk((event) => {
      if (event.summaryId !== activeSummaryIdRef.current) return;
      setStreaming(event.accumulatedText);
    });
    const offDone = dailySummaryApi.onDone((event) => {
      if (event.summaryId !== activeSummaryIdRef.current) return;
      activeSummaryIdRef.current = null;
      if (event.status === "completed") {
        setStreaming(null);
        setStatus("已生成");
        void queryClient.invalidateQueries({
          queryKey: ["daily-summary", projectId, date],
        });
      } else if (event.status === "failed") {
        setStatus(`生成失败：${event.error ?? "unknown"}`);
      } else {
        setStatus("已取消");
        setStreaming(null);
      }
    });
    return () => {
      offChunk?.();
      offDone?.();
    };
  }, [open, projectId, date, queryClient]);

  useEffect(() => {
    if (!open) {
      setStreaming(null);
      setStatus(null);
      activeSummaryIdRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const summary = summaryQuery.data ?? null;
  const displayed = streaming ?? summary?.summary ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-accent-300">📝 每日写作总结</h2>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-100"
            />
          </div>
          <div className="flex items-center gap-2">
            {status && <span className="text-xs text-ink-400">{status}</span>}
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-sm text-ink-400 hover:bg-ink-700"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin px-5 py-4">
          {summary && (
            <div className="mb-3 flex items-center gap-3 text-[11px] text-ink-400">
              <span>
                今日字数 <span className="text-ink-200">{summary.wordsAdded}</span> /
                目标 <span className="text-ink-200">{summary.goal}</span>
                {summary.goalHit && (
                  <span className="ml-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-300">
                    已达成
                  </span>
                )}
              </span>
              {summary.generatedAt && (
                <span>
                  最近生成：
                  {new Date(summary.generatedAt).toLocaleString("zh-CN")}
                </span>
              )}
              {summary.summaryProviderId && summary.summaryModel && (
                <span>
                  {summary.summaryProviderId} / {summary.summaryModel}
                </span>
              )}
            </div>
          )}
          {displayed.trim().length === 0 ? (
            <div className="rounded border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-400">
              还没有总结。点击下方「生成总结」让 AI 基于今日字数与最近章节节选生成日报。
            </div>
          ) : (
            <article className="whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm leading-7 text-ink-100">
              {displayed}
              {streaming !== null && (
                <span className="ml-0.5 animate-pulse text-accent-300">▋</span>
              )}
            </article>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-ink-700 bg-ink-900/30 px-5 py-3 text-xs">
          <span className="text-ink-500">
            基于 daily_logs.words_added + 最近 8 章节首 600 字作为上下文
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDate(todayKey())}
              className="rounded px-3 py-1 text-ink-300 hover:bg-ink-700"
            >
              回到今天
            </button>
            <button
              type="button"
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending || streaming !== null}
              className="rounded bg-accent-500 px-3 py-1 font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {streaming !== null
                ? "生成中…"
                : summary?.summary
                  ? "重新生成"
                  : "生成总结"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
