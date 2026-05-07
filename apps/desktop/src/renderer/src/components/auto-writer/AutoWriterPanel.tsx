import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoWriterAgentBinding,
  AutoWriterAgentRole,
  AutoWriterChunkEvent,
  AutoWriterDoneEvent,
  AutoWriterPhase,
  AutoWriterPhaseEvent,
  AutoWriterRunRecord,
} from "@inkforge/shared";
import {
  autoWriterApi,
  providerApi,
} from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { PostRunSegmentRewriter } from "./PostRunSegmentRewriter";

const ROLE_LABELS: Record<AutoWriterAgentRole, string> = {
  planner: "📋 提纲师",
  writer: "✒ 执笔者",
  critic: "🔍 审稿人",
  reflector: "🪞 反思者",
};

const PHASE_LABELS: Record<AutoWriterPhase, string> = {
  planner: "提纲师产出 beat sheet",
  writer: "执笔者写本段",
  critic: "审稿人检查 OOC",
  reflector: "反思者总结备忘",
  "rewrite-segment": "回炉重写本段",
  "next-segment": "进入下一段",
  done: "全部完成",
};

interface AutoWriterPanelProps {
  chapterId: string;
  projectId: string;
  chapterTitle?: string;
  onClose: () => void;
}

export function AutoWriterPanel({
  chapterId,
  projectId,
  chapterTitle,
  onClose,
}: AutoWriterPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  // v22+: 配置持久化——上次选好的 provider/model/段长等下次回填
  const remembered = useAppStore((s) => s.autoWriterConfig);
  const setRemembered = useAppStore((s) => s.setAutoWriterConfig);

  const [userIdeas, setUserIdeas] = useState("");
  const [advanced, setAdvanced] = useState(remembered?.advanced ?? false);
  const [primaryProviderId, setPrimaryProviderId] = useState<string>(
    remembered?.primaryProviderId ?? "",
  );
  const [primaryModel, setPrimaryModel] = useState<string>(remembered?.primaryModel ?? "");
  const [agentBindings, setAgentBindings] = useState<
    Partial<Record<AutoWriterAgentRole, { providerId: string; model: string }>>
  >(
    (remembered?.agentBindings as Partial<
      Record<AutoWriterAgentRole, { providerId: string; model: string }>
    >) ?? {},
  );
  const [targetSegmentLength, setTargetSegmentLength] = useState(
    remembered?.targetSegmentLength ?? 400,
  );
  const [maxSegments, setMaxSegments] = useState(remembered?.maxSegments ?? 10);
  const [maxRewrites, setMaxRewrites] = useState(remembered?.maxRewrites ?? 3);
  const [enableOocGate, setEnableOocGate] = useState(remembered?.enableOocGate ?? true);

  // 任意一个配置变化时同步到 zustand persist
  useEffect(() => {
    setRemembered({
      primaryProviderId,
      primaryModel,
      agentBindings,
      targetSegmentLength,
      maxSegments,
      maxRewrites,
      enableOocGate,
      advanced,
    });
  }, [
    primaryProviderId,
    primaryModel,
    agentBindings,
    targetSegmentLength,
    maxSegments,
    maxRewrites,
    enableOocGate,
    advanced,
    setRemembered,
  ]);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<AutoWriterPhaseEvent | null>(null);
  const [streamBuffers, setStreamBuffers] = useState<Record<AutoWriterAgentRole, string>>({
    planner: "",
    writer: "",
    critic: "",
    reflector: "",
  });
  const [doneEvent, setDoneEvent] = useState<AutoWriterDoneEvent | null>(null);
  const [interruptDraft, setInterruptDraft] = useState("");

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
  });

  // 默认填上第一个 provider
  useEffect(() => {
    if (!primaryProviderId && providersQuery.data && providersQuery.data.length > 0) {
      const first = providersQuery.data[0];
      setPrimaryProviderId(first.id);
      setPrimaryModel(first.defaultModel);
    }
  }, [providersQuery.data, primaryProviderId]);

  // 订阅流式事件
  const lastChunkRef = useRef<{ role: AutoWriterAgentRole | null; segIdx: number }>({
    role: null,
    segIdx: -1,
  });
  useEffect(() => {
    const unsubChunk = autoWriterApi.onChunk((payload: AutoWriterChunkEvent) => {
      if (activeRunId && payload.runId !== activeRunId) return;
      // 新角色开始 → 清空该角色 buffer
      if (lastChunkRef.current.role !== payload.agentRole) {
        setStreamBuffers((prev) => ({ ...prev, [payload.agentRole]: "" }));
        lastChunkRef.current = { role: payload.agentRole, segIdx: payload.segmentIndex };
      }
      setStreamBuffers((prev) => ({
        ...prev,
        [payload.agentRole]: payload.accumulatedText,
      }));
    });
    const unsubPhase = autoWriterApi.onPhase((payload: AutoWriterPhaseEvent) => {
      if (activeRunId && payload.runId !== activeRunId) return;
      setCurrentPhase(payload);
    });
    const unsubDone = autoWriterApi.onDone((payload: AutoWriterDoneEvent) => {
      if (activeRunId && payload.runId !== activeRunId) return;
      setDoneEvent(payload);
      setActiveRunId(null);
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
      queryClient.invalidateQueries({ queryKey: ["chapter-log", chapterId] });
    });
    return () => {
      unsubChunk();
      unsubPhase();
      unsubDone();
    };
  }, [activeRunId, queryClient, chapterId, projectId]);

  const startMut = useMutation({
    mutationFn: () => {
      const agents: AutoWriterAgentBinding[] = advanced
        ? (Object.keys(ROLE_LABELS) as AutoWriterAgentRole[]).map((role) => {
            const override = agentBindings[role];
            return {
              role,
              providerId: override?.providerId || primaryProviderId,
              model: override?.model || primaryModel,
            };
          })
        : [
            {
              role: "writer",
              providerId: primaryProviderId,
              model: primaryModel,
            },
          ];
      return autoWriterApi.start({
        projectId,
        chapterId,
        userIdeas,
        agents,
        targetSegmentLength,
        maxSegments,
        maxRewritesPerSegment: maxRewrites,
        enableOocGate,
      });
    },
    onSuccess: (res) => {
      setActiveRunId(res.runId);
      setDoneEvent(null);
      setCurrentPhase(null);
      setStreamBuffers({ planner: "", writer: "", critic: "", reflector: "" });
    },
  });

  const stopMut = useMutation({
    mutationFn: () => {
      if (!activeRunId) throw new Error("no active run");
      return autoWriterApi.stop({ runId: activeRunId });
    },
  });

  const injectMut = useMutation({
    mutationFn: (content: string) => {
      if (!activeRunId) throw new Error("no active run");
      return autoWriterApi.injectIdea({ runId: activeRunId, content });
    },
    onSuccess: () => setInterruptDraft(""),
  });

  const correctMut = useMutation({
    mutationFn: (content: string) => {
      if (!activeRunId) throw new Error("no active run");
      return autoWriterApi.correct({ runId: activeRunId, content });
    },
    onSuccess: () => setInterruptDraft(""),
  });

  const isRunning = !!activeRunId;
  const providers = providersQuery.data ?? [];
  const canStart =
    !isRunning && userIdeas.trim().length > 0 && primaryProviderId && primaryModel;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[520px] max-w-full flex-col border-l border-ink-700 bg-ink-800 text-ink-100 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold">🤖 AI 自动写作</h3>
          {chapterTitle && (
            <div className="truncate text-[11px] text-ink-400">{chapterTitle}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {/* 思路输入 */}
        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold text-ink-300">本章思路</label>
          <textarea
            value={userIdeas}
            onChange={(e) => setUserIdeas(e.target.value)}
            placeholder="比如：主角在密林遭遇敌袭，意外发现身世线索；情绪由警觉转为震惊；伏笔：陌生人留下的青铜令牌"
            disabled={isRunning}
            className="h-32 w-full resize-none rounded-md border border-ink-700 bg-ink-900 p-2 text-xs placeholder:text-ink-500 focus:border-amber-500 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-1 text-[10px] text-ink-500">{userIdeas.length} 字</div>
        </section>

        {/* 模型设置 */}
        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold text-ink-300">模型</label>
          <div className="flex gap-2">
            <select
              value={primaryProviderId}
              onChange={(e) => {
                const id = e.target.value;
                setPrimaryProviderId(id);
                const p = providers.find((x) => x.id === id);
                if (p) setPrimaryModel(p.defaultModel);
              }}
              disabled={isRunning}
              className="flex-1 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
            >
              <option value="">选择 Provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              placeholder="model id"
              disabled={isRunning}
              className="w-40 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="mt-1 text-[10px] text-amber-300 hover:underline"
          >
            {advanced ? "收起高级" : "高级：为各角色分别绑定模型"}
          </button>
          {advanced && (
            <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-ink-700 bg-ink-900/40 p-2">
              {(Object.keys(ROLE_LABELS) as AutoWriterAgentRole[]).map((role) => {
                const binding = agentBindings[role];
                return (
                  <div key={role} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-ink-300">{ROLE_LABELS[role]}</span>
                    <select
                      value={binding?.providerId ?? ""}
                      onChange={(e) =>
                        setAgentBindings((prev) => ({
                          ...prev,
                          [role]: {
                            providerId: e.target.value,
                            model: binding?.model ?? "",
                          },
                        }))
                      }
                      disabled={isRunning}
                      className="flex-1 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-[11px]"
                    >
                      <option value="">使用主模型</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={binding?.model ?? ""}
                      onChange={(e) =>
                        setAgentBindings((prev) => ({
                          ...prev,
                          [role]: {
                            providerId: binding?.providerId ?? "",
                            model: e.target.value,
                          },
                        }))
                      }
                      placeholder="model"
                      disabled={isRunning}
                      className="w-32 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 参数 */}
        <section className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-ink-400">单段字数</span>
            <input
              type="number"
              value={targetSegmentLength}
              onChange={(e) => setTargetSegmentLength(Number(e.target.value) || 400)}
              disabled={isRunning}
              className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-400">最多段数</span>
            <input
              type="number"
              value={maxSegments}
              onChange={(e) => setMaxSegments(Number(e.target.value) || 10)}
              disabled={isRunning}
              className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-400">重写上限</span>
            <input
              type="number"
              value={maxRewrites}
              onChange={(e) => setMaxRewrites(Number(e.target.value) || 3)}
              disabled={isRunning}
              className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5"
            />
          </label>
        </section>
        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enableOocGate}
            onChange={(e) => setEnableOocGate(e.target.checked)}
            disabled={isRunning}
          />
          <span>启用 OOC 守门员（Critic 不通过时回炉重写）</span>
        </label>

        {/* 控制 */}
        <section className="mb-3 flex gap-2">
          {!isRunning ? (
            <button
              type="button"
              disabled={!canStart || startMut.isPending}
              onClick={() => startMut.mutate()}
              className="flex-1 rounded-md bg-amber-500/30 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/40 disabled:opacity-40"
            >
              {startMut.isPending ? "启动中…" : "🚀 启动 AutoWriter"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopMut.mutate()}
              className="flex-1 rounded-md bg-rose-500/30 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/40"
            >
              ⏹ 停止
            </button>
          )}
        </section>
        {startMut.isError && (
          <div className="mb-2 rounded-md bg-rose-500/20 px-2 py-1 text-xs text-rose-200">
            启动失败：{String(startMut.error)}
          </div>
        )}

        {/* Phase 指示 */}
        {currentPhase && (
          <section className="mb-3 rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-100">
                Phase
              </span>
              <span>{PHASE_LABELS[currentPhase.phase]}</span>
              <span className="ml-auto text-ink-400">
                第 {currentPhase.segmentIndex + 1} 段
                {currentPhase.rewriteCount
                  ? ` · 第 ${currentPhase.rewriteCount} 次重写`
                  : ""}
              </span>
            </div>
            {currentPhase.criticSummary && (
              <div className="mt-1 flex gap-2 text-[10px]">
                <span className="text-rose-300">
                  🔴 {currentPhase.criticSummary.errorCount}
                </span>
                <span className="text-amber-300">
                  🟡 {currentPhase.criticSummary.warnCount}
                </span>
                <span className="text-sky-300">
                  🔵 {currentPhase.criticSummary.infoCount}
                </span>
              </div>
            )}
          </section>
        )}

        {/* 中途介入 */}
        {isRunning && (
          <section className="mb-3 rounded-md border border-ink-700 bg-ink-900/40 p-2">
            <div className="mb-1 text-xs text-ink-300">中途介入（追加思路或纠错）</div>
            <textarea
              value={interruptDraft}
              onChange={(e) => setInterruptDraft(e.target.value)}
              placeholder="可以补一个新约束，比如：让对话更含蓄；或指出某段有 OOC……"
              className="h-16 w-full resize-none rounded-md border border-ink-700 bg-ink-900 p-2 text-xs"
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={!interruptDraft.trim() || injectMut.isPending}
                onClick={() => injectMut.mutate(interruptDraft.trim())}
                className="rounded-md bg-sky-500/30 px-2 py-1 text-xs text-sky-100 hover:bg-sky-500/40 disabled:opacity-40"
              >
                💡 追加思路
              </button>
              <button
                type="button"
                disabled={!interruptDraft.trim() || correctMut.isPending}
                onClick={() => correctMut.mutate(interruptDraft.trim())}
                className="rounded-md bg-rose-500/30 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/40 disabled:opacity-40"
              >
                ✗ 标记错误
              </button>
            </div>
          </section>
        )}

        {/* 流式输出 */}
        <section className="mb-3 grid grid-cols-1 gap-2">
          {(Object.keys(ROLE_LABELS) as AutoWriterAgentRole[]).map((role) => {
            const text = streamBuffers[role];
            if (!text) return null;
            return (
              <div
                key={role}
                className="rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs"
              >
                <div className="mb-1 text-[11px] text-ink-400">{ROLE_LABELS[role]}</div>
                <pre className="whitespace-pre-wrap text-ink-100">{text}</pre>
              </div>
            );
          })}
        </section>

        {/* 完成 */}
        {doneEvent && (
          <>
            <section
              className={`mb-3 rounded-md border p-2 text-xs ${
                doneEvent.status === "completed"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : doneEvent.status === "partial"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                    : doneEvent.status === "stopped"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-100"
              }`}
            >
              <div className="font-semibold">
                {doneEvent.status === "completed" && "✓ 全部完成"}
                {doneEvent.status === "partial" &&
                  `⚠ 部分完成（已保留前 ${doneEvent.totalSegments} 段）`}
                {doneEvent.status === "stopped" && "⏹ 已手动停止"}
                {doneEvent.status === "failed" && "✗ 全部失败"}
                {doneEvent.status !== "completed" &&
                  doneEvent.status !== "partial" &&
                  doneEvent.status !== "stopped" &&
                  doneEvent.status !== "failed" &&
                  `运行结束：${doneEvent.status}`}
              </div>
              <div className="mt-1 text-[11px]">
                {doneEvent.totalSegments} 段 · 重写 {doneEvent.totalRewrites} 次 · token{" "}
                {doneEvent.totalTokensIn} ↑ / {doneEvent.totalTokensOut} ↓
              </div>
              {doneEvent.error && (
                <div className="mt-1 text-[11px] text-rose-200">错误：{doneEvent.error}</div>
              )}
            </section>

            {/* v22+: 段落审改——对每段否决重写 */}
            {(doneEvent.status === "completed" || doneEvent.status === "partial") && (
              <PostRunSegmentRewriter
                chapterId={chapterId}
                projectId={projectId}
                chapterTitle={chapterTitle}
                onChapterUpdated={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["chapters", projectId],
                  })
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 让外部能拿到 record（用于 PR 验证 / 回归）
export type { AutoWriterRunRecord };
