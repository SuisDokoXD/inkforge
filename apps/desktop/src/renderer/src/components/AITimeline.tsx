import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAppStore } from "../stores/app-store";
import { feedbackApi } from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
} from "../lib/motion-tokens";
import type { AIFeedbackRecord } from "@inkforge/shared";
import { Badge, Button } from "./ui";

type DisplayItem = {
  kind: "streaming" | "history";
  id: string;
  type: string;
  status: "streaming" | "completed" | "failed";
  text: string;
  error?: string;
  createdAt: string;
  dismissed?: boolean;
};

const TYPE_META: Record<string, { label: string; badgeClass: string }> = {
  analysis: { label: "自动建议", badgeClass: "bg-sky-500/20 text-sky-300 ring-sky-500/30" },
  critique: { label: "选段审查", badgeClass: "bg-accent-500/20 text-accent-300 ring-accent-500/30" },
};

function summarize(text: string, max = 60): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max) + "…";
}

export function AITimeline(): JSX.Element {
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const analyses = useAppStore((s) => s.analyses);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [confirmClearChapter, setConfirmClearChapter] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  const historyQuery = useQuery<AIFeedbackRecord[]>({
    queryKey: ["feedbacks", currentChapterId],
    queryFn: () =>
      currentChapterId ? feedbackApi.list({ chapterId: currentChapterId }) : Promise.resolve([]),
    enabled: !!currentChapterId,
  });

  const dismiss = useMutation({
    mutationFn: ({ id, dismissed }: { id: string; dismissed: boolean }) =>
      feedbackApi.dismiss({ id, dismissed }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feedbacks", currentChapterId] });
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "写作建议状态更新失败，请稍后重试。"));
    },
  });

  const deleteEmpty = useMutation({
    mutationFn: (chapterId: string) => feedbackApi.deleteEmpty({ chapterId }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feedbacks", currentChapterId] });
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "删除空建议失败，请稍后重试。"));
    },
  });

  const clearChapter = useMutation({
    mutationFn: (chapterId: string) => feedbackApi.clearChapter({ chapterId }),
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: () => {
      setExpandedId(null);
      setConfirmClearChapter(false);
      void queryClient.invalidateQueries({ queryKey: ["feedbacks", currentChapterId] });
    },
    onError: (err) => {
      setActionError(friendlyErrorMessage(err, "清空本章写作建议失败，请稍后重试。"));
    },
  });

  useEffect(() => {
    if (analyses.some((a) => a.status === "completed")) {
      void queryClient.invalidateQueries({ queryKey: ["feedbacks", currentChapterId] });
    }
  }, [analyses, currentChapterId, queryClient]);

  useEffect(() => {
    setConfirmClearChapter(false);
  }, [currentChapterId]);

  const items: DisplayItem[] = useMemo(() => {
    const streamingItems: DisplayItem[] = analyses
      .filter((a) => a.chapterId === currentChapterId)
      .filter((a) => a.status !== "completed" || a.accumulatedText.trim() || a.error)
      .map((a) => ({
        kind: "streaming" as const,
        id: a.analysisId,
        type: "analysis",
        status: a.status,
        text: a.accumulatedText,
        error: a.error,
        createdAt: a.startedAt,
      }));
    const historyItems: DisplayItem[] = (historyQuery.data ?? [])
      .filter((f) => !streamingItems.some((s) => s.id === f.id))
      .map((f) => ({
        kind: "history" as const,
        id: f.id,
        type: f.type || "analysis",
        status: "completed" as const,
        text: typeof f.payload?.text === "string" ? (f.payload.text as string) : "",
        error: undefined,
        createdAt: f.createdAt,
        dismissed: f.dismissed,
      }));
    return [...streamingItems, ...historyItems];
  }, [analyses, currentChapterId, historyQuery.data]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (showDismissed || !item.dismissed) &&
          (item.kind !== "history" || item.text.trim().length > 0),
      ),
    [items, showDismissed],
  );
  const dismissedCount = items.filter((item) => item.dismissed).length;
  const historyCount = items.filter((item) => item.kind === "history").length;
  const emptyHistoryCount = items.filter((item) => item.kind === "history" && !item.text.trim()).length;

  // M9 Phase 2.2: virtualize visible list. Variable heights handled via measureElement.
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const item = visible[index];
      const expanded = expandedId === item?.id || item?.status === "streaming";
      return expanded ? 180 : 44;
    },
    overscan: 6,
    getItemKey: (index) => visible[index]?.id ?? index,
  });

  return (
    <div className="flex h-full flex-col" role="feed" aria-label="写作建议时间线">
      {(historyCount > 0 || dismissedCount > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-ink-700 px-3 py-1.5 text-xs">
          {emptyHistoryCount > 0 && currentChapterId && (
            <Button
              type="button"
              className="px-2 py-0.5 text-[11px]"
              variant="ghost"
              size="sm"
              onClick={() => deleteEmpty.mutate(currentChapterId)}
              disabled={deleteEmpty.isPending || clearChapter.isPending}
              title="删除当前章节中内容为空的历史建议"
            >
              删除空建议 ({emptyHistoryCount})
            </Button>
          )}
          {historyCount > 0 && currentChapterId && (
            <AnimatePresence initial={false} mode="wait">
              {confirmClearChapter ? (
                <motion.div
                  key="clear-confirm"
                  variants={stateMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex items-center gap-1"
                >
                  <Button
                    type="button"
                    onClick={() => setConfirmClearChapter(false)}
                    disabled={deleteEmpty.isPending || clearChapter.isPending}
                    className="px-2 py-0.5 text-[11px]"
                    variant="ghost"
                    size="sm"
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={() => clearChapter.mutate(currentChapterId)}
                    disabled={deleteEmpty.isPending || clearChapter.isPending}
                    className="px-2 py-0.5 text-[11px]"
                    variant="danger"
                    size="sm"
                  >
                    {clearChapter.isPending ? "清空中" : `确认清空 ${historyCount} 条`}
                  </Button>
                </motion.div>
              ) : (
                <Button
                  key="clear-start"
                  type="button"
                  className="px-2 py-0.5 text-[11px] text-ink-400 hover:bg-red-500/15 hover:text-red-300"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClearChapter(true)}
                  disabled={deleteEmpty.isPending || clearChapter.isPending}
                  title="清空当前章节所有已保存的写作建议历史"
                  variants={stateMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  清空本章
                </Button>
              )}
            </AnimatePresence>
          )}
          <Button
            type="button"
            className={`px-2 py-0.5 text-[11px] ${
              dismissedCount > 0 ? "" : "hidden"
            }`}
            variant="ghost"
            size="sm"
            onClick={() => setShowDismissed((v) => !v)}
            aria-pressed={showDismissed}
          >
            {showDismissed ? "隐藏已忽略" : `显示已忽略 (${dismissedCount})`}
          </Button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.div
            className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100"
            role="alert"
            variants={stateMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <span>{actionError}</span>
            <Button
              type="button"
              className="shrink-0 px-2 py-0.5 text-red-100 hover:bg-red-500/20"
              variant="ghost"
              size="sm"
              onClick={() => setActionError(null)}
            >
              知道了
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin px-3 py-3">
        <AnimatePresence initial={false} mode="wait">
          {!currentChapterId && (
            <motion.p
              key="no-chapter"
              className="text-xs text-ink-400"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              选定一章后，写作建议会在这里出现。
            </motion.p>
          )}
          {currentChapterId && visible.length === 0 && (
            <motion.p
              key="empty-suggestions"
              className="text-xs text-ink-400"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              写满 200 字后，这里会出现一条自动写作建议。
            </motion.p>
          )}
        </AnimatePresence>
        {visible.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const item = visible[vRow.index];
              const expanded = expandedId === item.id || item.status === "streaming";
              const meta = TYPE_META[item.type] ?? TYPE_META.analysis;
              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vRow.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <div
                    className={`rounded-lg border text-sm transition-colors ${
                      item.status === "failed"
                        ? "border-red-500/40 bg-red-500/10 text-red-200"
                        : item.dismissed
                          ? "border-ink-700 bg-ink-800/30 text-ink-400"
                          : "border-ink-700 bg-ink-800/60 text-ink-100"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      title={summarize(item.text || "", 120)}
                      aria-expanded={expanded}
                      aria-controls={`ai-feedback-${item.id}`}
                    >
                      <Badge
                        tone="neutral"
                        className={`rounded px-1.5 font-normal uppercase tracking-wide ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </Badge>
                      <span className="flex-1 truncate text-[12px] text-ink-300">
                        {item.status === "streaming"
                          ? "生成中…"
                          : item.status === "failed"
                            ? `失败：${friendlyErrorMessage(item.error, "写作建议暂时不可用，请稍后重试。")}`
                            : summarize(item.text || "", 40) || "无正文"}
                      </span>
                      <time className="shrink-0 text-[10px] text-ink-500">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </time>
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          id={`ai-feedback-${item.id}`}
                          className="border-t border-ink-700/60 px-3 py-2"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          <div className="whitespace-pre-wrap text-[13px] leading-6">
                            {item.text || (item.status === "streaming" ? "…" : "")}
                          </div>
                          {item.kind === "history" && item.status !== "failed" && (
                            <div className="mt-2 flex justify-end gap-2 text-xs">
                              {item.dismissed ? (
                                <Button
                                  type="button"
                                  className="px-2 py-0.5"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => dismiss.mutate({ id: item.id, dismissed: false })}
                                  disabled={dismiss.isPending}
                                >
                                  恢复
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  className="px-2 py-0.5"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => dismiss.mutate({ id: item.id, dismissed: true })}
                                  disabled={dismiss.isPending}
                                >
                                  忽略
                                </Button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
