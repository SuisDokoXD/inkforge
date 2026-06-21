// =============================================================================
// 世界观资料参考记录面板
// =============================================================================
// SillyTavern 一直只往 console.log 写激活情况，作者问"为啥这条没生效"基本靠猜。
// 本面板把每次 activator 跑的完整 trace 可视化：
//   左：最近 N 次激活的简表（场景 + 时间 + 注入数 / 总数）
//   右：选中那次的全部 entries 列表 + 状态徽章（已参考 / 容量超限 / 概率失 / 逻辑失）
//
// 数据来自 world_info_traces 表（v26），通过 worldInfoTraceApi 查询。
// 调用方传 projectId 即可，UI 自己管理选中 + 刷新。
// =============================================================================

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleX,
  Dices,
  RefreshCw,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { worldInfoTraceApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import { MotionSpin } from "../MotionSpinner";
import { Badge } from "../ui";
import type {
  WorldInfoEntryTrace,
  WorldInfoTraceRecord,
} from "@inkforge/shared";

interface Props {
  projectId: string;
}

const LOGIC_LABELS: Record<string, string> = {
  and_any: "主关键词 + 任一辅助词",
  and_all: "主关键词 + 全部辅助词",
  not_any: "主关键词出现，辅助词都不出现",
  not_all: "主关键词出现，辅助词不全出现",
};

function sceneLabel(scene: string): string {
  const labels: Record<string, string> = {
    skill: "技能执行",
    "auto-writer": "续写精修",
    chat: "写作问答",
    review: "正文审查",
    quick: "快捷改写",
    letter: "人物来信",
    tavern: "酒馆对话",
    "world-pack-fusion": "卡牌融合",
    "chapter-generation": "章节生成",
    outline: "大纲生成",
    analysis: "正文分析",
  };
  return labels[scene] ?? "模型写作";
}

// 给单条 entry trace 渲染一个状态徽章 + 中文文案。
function StatusBadge({ trace }: { trace: WorldInfoEntryTrace }): JSX.Element {
  if (trace.injected) {
    return (
      <Badge tone="success" className="gap-1 px-1.5 text-[11px]">
        <CheckCircle2 className="h-3 w-3" />
        {trace.constant ? "总是参考" : "已参考"}
      </Badge>
    );
  }
  if (trace.droppedReason === "budget_exceeded") {
    return (
      <Badge tone="warning" className="gap-1 px-1.5 text-[11px]">
        <Wallet className="h-3 w-3" />
        字数超限
      </Badge>
    );
  }
  if (trace.droppedReason === "prob_failed") {
    return (
      <Badge tone="accent" className="gap-1 px-1.5 text-[11px]">
        <Dices className="h-3 w-3" />
        随机跳过
      </Badge>
    );
  }
  if (trace.droppedReason === "logic_failed") {
    return (
      <Badge tone="danger" className="gap-1 px-1.5 text-[11px]">
        <CircleX className="h-3 w-3" />
        未命中
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className="gap-1 px-1.5 text-[11px]">
      <XCircle className="h-3 w-3" />
      未参考
    </Badge>
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
  const [confirmClear, setConfirmClear] = useState(false);
  const { status, showStatus } = useTimedStatus();
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
      };

  const tracesQuery = useQuery({
    queryKey: ["world-info-traces", projectId],
    queryFn: () => worldInfoTraceApi.listRecent({ projectId, limit: 30 }),
    refetchInterval: 5000, // 5 秒轮询，保证刚跑完的激活立刻能看到
  });

  const clearMutation = useMutation({
    mutationFn: () => worldInfoTraceApi.clear({ projectId }),
    onMutate: () => {
      showStatus(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["world-info-traces", projectId],
      });
      setSelectedTraceId(null);
      setConfirmClear(false);
      showStatus("参考记录已清空。", 2500);
    },
    onError: (err) => {
      showStatus(friendlyErrorMessage(err, "清空参考记录失败，请稍后重试。"));
    },
  });

  useEffect(() => {
    setConfirmClear(false);
    showStatus(null);
  }, [projectId, showStatus]);

  const traces: WorldInfoTraceRecord[] = tracesQuery.data ?? [];
  const selected = traces.find((t) => t.id === selectedTraceId) ?? traces[0] ?? null;
  const statusIsError = status !== null && /失败|无法|异常|错误/.test(status);
  const clearDisabled = traces.length === 0 || clearMutation.isPending;

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-900">
      {/* 左：trace 列表 */}
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-ink-700 bg-ink-950/60">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-3 py-2">
          <span className="text-sm font-medium text-ink-200">参考记录</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => tracesQuery.refetch()}
              title="刷新"
              aria-label="刷新参考记录"
              className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
            >
              <MotionSpin active={tracesQuery.isFetching}>
                <RefreshCw className="h-3.5 w-3.5" />
              </MotionSpin>
            </button>
            <button
              type="button"
              onClick={() => {
                showStatus(null);
                setConfirmClear(true);
              }}
              disabled={clearDisabled}
              title="清空所有参考记录"
              aria-label="清空所有参考记录"
              aria-expanded={confirmClear}
              aria-controls="world-info-clear-confirm"
              className="rounded p-1 text-ink-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-default disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {confirmClear ? (
            <motion.div
              id="world-info-clear-confirm"
              key="clear-confirm"
              role="group"
              aria-label="确认清空参考记录"
              className="border-b border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
              variants={panelMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium">清空全部参考记录？</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-rose-100/75">
                    只会移除这页的判断记录，不会删除世界观资料、卡牌或正文。
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <motion.button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800"
                  {...buttonMotion}
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  className="rounded bg-rose-500/25 px-2 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/35 disabled:cursor-wait disabled:opacity-60"
                  {...buttonMotion}
                >
                  {clearMutation.isPending ? "清空中…" : "确认清空"}
                </motion.button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {status ? (
            <motion.div
              key="clear-status"
              className={`border-b px-3 py-2 text-xs ${
                statusIsError
                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                  : "border-ink-800 bg-ink-900/60 text-ink-300"
              }`}
              role={statusIsError ? "alert" : "status"}
              variants={panelMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {status}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex-1 overflow-y-auto">
          {traces.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-500">
              <BarChart3 aria-hidden className="mx-auto mb-2 h-8 w-8 opacity-40" />
              暂无参考记录
              <br />
              触发带世界观资料的模型操作后会自动出现
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
                    <span className="font-medium">{sceneLabel(t.scene)}</span>
                    <span className="text-[10px] text-ink-500">
                      {formatTimestamp(t.createdAt)}
                    </span>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-ink-400">
                    <span>
                      参考 {injected}/{total}
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
                {sceneLabel(selected.scene)} · {formatTimestamp(selected.createdAt)}
              </div>
              <div className="mt-1 text-xs text-ink-400">
                共判断 {selected.entries.length} 条 · 已参考{" "}
                {selected.entries.filter((e) => e.injected).length} 条 · 参考字数{" "}
                {selected.charsUsed}/{selected.charBudget}
              </div>
              {selected.scanTextPreview && (
                <div className="mt-2 line-clamp-2 rounded bg-ink-950/60 px-2 py-1 text-[11px] text-ink-400">
                  本次判断依据：{selected.scanTextPreview}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selected.entries.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-500">
                  这次没有可参考条目
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
                              命中关键词：{e.matchedKeys.length > 0 ? e.matchedKeys.join("/") : "—"}
                            </span>
                            {e.secondaryMatched.length > 0 && (
                              <span>辅助命中：{e.secondaryMatched.join("/")}</span>
                            )}
                            <span>
                              组合方式：{LOGIC_LABELS[e.selectiveLogic] ?? "默认"}
                            </span>
                            <span>
                              触发概率：{e.probability}
                              {e.rolled !== null
                                ? `（本次随机 ${e.rolled.toFixed(0)}）`
                                : ""}
                            </span>
                            <span>约占：{e.approxChars} 字</span>
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
              <BarChart3 aria-hidden className="mx-auto mb-3 h-10 w-10 opacity-30" />
              从左侧选一条参考记录
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
