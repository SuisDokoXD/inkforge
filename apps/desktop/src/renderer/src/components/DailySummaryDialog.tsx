import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText, X } from "lucide-react";
import { dailySummaryApi } from "../lib/api";
import { AnimatedDialog } from "./AnimatedDialog";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { DUR, EASE_IN_OUT, fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import { Button, IconButton } from "./ui";

interface DailySummaryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

type SummaryStatus = {
  kind: "info" | "success" | "error";
  text: string;
};

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
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [date, setDate] = useState<string>(todayKey());
  const [streaming, setStreaming] = useState<string | null>(null);
  const { status, showStatus } = useTimedStatus<SummaryStatus>();
  const activeSummaryIdRef = useRef<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["daily-summary", projectId, date],
    queryFn: () => dailySummaryApi.get({ projectId, date }),
    enabled: open && !!projectId && !!date,
  });

  const generateMut = useMutation({
    mutationFn: () => dailySummaryApi.generate({ projectId, date }),
    onMutate: () => {
      showStatus({ kind: "info", text: "准备生成…" });
      setStreaming(null);
      activeSummaryIdRef.current = null;
    },
    onSuccess: (res) => {
      activeSummaryIdRef.current = res.summaryId;
      setStreaming("");
      showStatus({ kind: "info", text: "生成中…" });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `启动失败：${friendlyErrorMessage(err, "总结生成失败，请稍后重试。")}`,
      });
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
        showStatus({ kind: "success", text: "已生成" }, 2200);
        void queryClient.invalidateQueries({
          queryKey: ["daily-summary", projectId, date],
        });
      } else if (event.status === "failed") {
        setStreaming(null);
        showStatus({
          kind: "error",
          text: `生成失败：${friendlyErrorMessage(event.error, "总结生成失败，请稍后重试。")}`,
        });
      } else {
        showStatus({ kind: "info", text: "已取消" }, 1800);
        setStreaming(null);
      }
    });
    return () => {
      offChunk?.();
      offDone?.();
    };
  }, [open, projectId, date, queryClient, showStatus]);

  useEffect(() => {
    if (!open) {
      setStreaming(null);
      showStatus(null);
      activeSummaryIdRef.current = null;
    }
  }, [open, showStatus]);

  const summary = summaryQuery.data ?? null;
  const displayed = streaming ?? summary?.summary ?? "";
  const statusIsError = status?.kind === "error";
  const statusClassName =
    status?.kind === "error"
      ? "text-red-300"
      : status?.kind === "success"
        ? "text-emerald-300"
        : "text-ink-400";
  const isGenerating = generateMut.isPending || streaming !== null;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="daily-summary-title"
      overlayClassName="flex items-center justify-center p-6"
      panelClassName="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-800 shadow-2xl"
    >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 id="daily-summary-title" className="flex items-center gap-1.5 text-sm font-semibold text-accent-300">
              <FileText className="h-4 w-4" aria-hidden />
              每日写作总结
            </h2>
            <label className="sr-only" htmlFor="daily-summary-date">
              选择总结日期
            </label>
            <input
              id="daily-summary-date"
              type="date"
              value={date}
              disabled={isGenerating}
              title={isGenerating ? "生成中暂时锁定日期" : "选择总结日期"}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-100 disabled:cursor-default disabled:opacity-60"
            />
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence initial={false}>
              {status && (
                <motion.span
                  className={`text-xs ${statusClassName}`}
                  role={statusIsError ? "alert" : "status"}
                  variants={stateMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {status.text}
                </motion.span>
              )}
            </AnimatePresence>
            <IconButton
              size="sm"
              variant="ghost"
              className="text-ink-400 hover:bg-ink-700 hover:text-ink-200"
              onClick={onClose}
              aria-label="关闭每日写作总结"
              title="关闭"
            >
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin px-5 py-4">
          <AnimatePresence initial={false}>
            {summaryQuery.isError ? (
              <motion.div
                className="mb-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                role="alert"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                读取总结失败：{friendlyErrorMessage(summaryQuery.error, "总结暂时无法读取，请稍后重试。")}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {summary && (
              <motion.div
                className="mb-3 flex items-center gap-3 text-[11px] text-ink-400"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
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
                {summary.summaryProviderId && summary.summaryModel && <span>由模型服务生成</span>}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {displayed.trim().length === 0 ? (
              <motion.div
                key="empty"
                className="rounded border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-400"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                还没有总结。点击下方「生成总结」，系统会基于今日字数与最近章节节选生成日报。
              </motion.div>
            ) : (
              <motion.article
                key="summary"
                className="whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm leading-7 text-ink-100"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {displayed}
                {streaming !== null && (
                  <motion.span
                    className="ml-0.5 text-accent-300"
                    aria-hidden
                    animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.25, 1] }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: DUR.slow * 2, ease: EASE_IN_OUT, repeat: Infinity }
                    }
                  >
                    ▋
                  </motion.span>
                )}
              </motion.article>
              )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between border-t border-ink-700 bg-ink-900/30 px-5 py-3 text-xs">
          <span className="text-ink-500">
            基于今日字数和最近章节片段生成，只作写作回顾。
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="disabled:hover:bg-transparent"
              onClick={() => setDate(todayKey())}
              disabled={isGenerating}
              title={isGenerating ? "生成中暂时锁定日期" : undefined}
            >
              回到今天
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => generateMut.mutate()}
              disabled={isGenerating}
            >
              {streaming !== null
                ? "生成中…"
                : summary?.summary
                  ? "重新生成"
                  : "生成总结"}
            </Button>
          </div>
        </div>
    </AnimatedDialog>
  );
}
