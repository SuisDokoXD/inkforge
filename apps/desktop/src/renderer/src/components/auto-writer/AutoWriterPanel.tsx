import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  BookText,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileSearch,
  Loader2,
  PenLine,
  RotateCcw,
  Send,
  Settings2,
  Square,
  X,
} from "lucide-react";
import type {
  AutoWriterAgentBinding,
  AutoWriterAgentRole,
  AutoWriterChunkEvent,
  AutoWriterDoneEvent,
  AutoWriterPhase,
  AutoWriterPhaseEvent,
  AutoWriterRunRecord,
  OutlineCardRecord,
  SampleLibRecord,
} from "@inkforge/shared";
import {
  AUTO_WRITER_DEFAULTS,
  AUTO_WRITER_FAST_PRESET,
  AUTO_WRITER_PARAMETER_LIMITS,
} from "@inkforge/shared";
import { autoWriterApi, outlineApi, providerApi, sampleLibApi } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { useWritingFlowActions } from "../../lib/use-writing-flow-actions";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { SampleReferencePicker } from "../SampleReferencePicker";
import { PostRunSegmentRewriter } from "./PostRunSegmentRewriter";

const ROLE_LABELS: Record<AutoWriterAgentRole, string> = {
  planner: "结构",
  writer: "起草",
  critic: "校阅",
  reflector: "整理",
};

const PHASE_LABELS: Record<AutoWriterPhase, string> = {
  planner: "梳理写作结构",
  writer: "生成当前段落",
  critic: "检查一致性",
  reflector: "整理运行记录",
  "rewrite-segment": "重写当前段落",
  "next-segment": "进入下一段",
  done: "完成",
};

interface AutoWriterPanelProps {
  chapterId: string;
  projectId: string;
  chapterTitle?: string;
  chapterWordCount?: number;
  onClose: () => void;
  variant?: "drawer" | "embedded";
}

export function AutoWriterPanel({
  chapterId,
  projectId,
  chapterTitle,
  chapterWordCount,
  onClose,
  variant = "drawer",
}: AutoWriterPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const remembered = useAppStore((s) => s.autoWriterConfig);
  const setRemembered = useAppStore((s) => s.setAutoWriterConfig);
  const flowActions = useWritingFlowActions();
  const isStartingDraft = (chapterWordCount ?? 0) <= 0;

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
    remembered?.targetSegmentLength ?? AUTO_WRITER_DEFAULTS.targetSegmentLength,
  );
  const [maxSegments, setMaxSegments] = useState(
    remembered?.maxSegments ?? AUTO_WRITER_DEFAULTS.maxSegments,
  );
  const [maxRewrites, setMaxRewrites] = useState(
    remembered?.maxRewrites ?? AUTO_WRITER_DEFAULTS.maxRewritesPerSegment,
  );
  const [enableOocGate, setEnableOocGate] = useState(
    remembered?.enableOocGate ?? AUTO_WRITER_DEFAULTS.enableOocGate,
  );
  const [speedMode, setSpeedMode] = useState<"fast" | "quality">(
    remembered?.speedMode ?? AUTO_WRITER_DEFAULTS.speedMode,
  );
  const [selectedSampleLibIds, setSelectedSampleLibIds] = useState<string[]>(
    remembered?.sampleLibIds ?? [],
  );

  useEffect(() => {
    setRemembered({
      primaryProviderId,
      primaryModel,
      agentBindings,
      targetSegmentLength,
      maxSegments,
      maxRewrites,
      enableOocGate,
      speedMode,
      advanced,
      sampleLibIds: selectedSampleLibIds,
    });
  }, [
    primaryProviderId,
    primaryModel,
    agentBindings,
    targetSegmentLength,
    maxSegments,
    maxRewrites,
    enableOocGate,
    speedMode,
    advanced,
    selectedSampleLibIds,
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
  const outlineCardsQuery = useQuery<OutlineCardRecord[]>({
    queryKey: ["outline-cards", projectId],
    queryFn: () => outlineApi.list({ projectId }),
  });
  const sampleLibsQuery = useQuery<SampleLibRecord[]>({
    queryKey: ["sample-libs", projectId],
    queryFn: () => sampleLibApi.list({ projectId }),
  });
  const linkedOutlineCard =
    outlineCardsQuery.data?.find((card) => card.chapterId === chapterId) ?? null;
  const sampleLibs = sampleLibsQuery.data ?? [];

  useEffect(() => {
    if (!primaryProviderId && providersQuery.data && providersQuery.data.length > 0) {
      const first = providersQuery.data[0];
      setPrimaryProviderId(first.id);
      setPrimaryModel(first.defaultModel);
    }
  }, [providersQuery.data, primaryProviderId]);

  const lastChunkRef = useRef<{ role: AutoWriterAgentRole | null; segIdx: number }>({
    role: null,
    segIdx: -1,
  });

  useEffect(() => {
    const unsubChunk = autoWriterApi.onChunk((payload: AutoWriterChunkEvent) => {
      if (activeRunId && payload.runId !== activeRunId) return;
      if (lastChunkRef.current.role !== payload.agentRole) {
        setStreamBuffers((prev) => ({ ...prev, [payload.agentRole]: "" }));
        lastChunkRef.current = { role: payload.agentRole, segIdx: payload.segmentIndex };
      }
      setStreamBuffers((prev) => ({
        ...prev,
        [payload.agentRole]:
          payload.accumulatedText && payload.accumulatedText.length > 0
            ? payload.accumulatedText
            : `${prev[payload.agentRole] ?? ""}${payload.delta}`,
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
        maxRewritesPerSegment: speedMode === "fast" ? 0 : maxRewrites,
        enableOocGate: speedMode === "fast" ? false : enableOocGate,
        sampleLibIds: selectedSampleLibIds.length > 0 ? selectedSampleLibIds : undefined,
        speedMode,
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
  const canStart = !isRunning && userIdeas.trim().length > 0 && primaryProviderId && primaryModel;
  const containerClass =
    variant === "drawer"
      ? "fixed inset-y-0 right-0 z-40 flex w-[540px] max-w-full flex-col border-l border-ink-700 bg-ink-950 text-ink-100 shadow-2xl"
      : "flex h-full min-h-0 flex-col bg-ink-950 text-ink-100";

  return (
    <div className={containerClass}>
      <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900/45 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-accent-300" />
            <h3 className="text-sm font-semibold">AI 写作</h3>
          </div>
          {chapterTitle ? (
            <div className="mt-1 truncate text-xs text-ink-500">{chapterTitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          title="关闭"
          aria-label="关闭 AI 写作"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
        <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
          <div className="mb-2 flex items-center gap-2">
            <BookText className="h-4 w-4 text-ink-400" />
            <label className="text-sm font-medium text-ink-200">本次写作要求</label>
          </div>
          <textarea
            value={userIdeas}
            onChange={(event) => setUserIdeas(event.target.value)}
            placeholder={
              isStartingDraft
                ? "写下这一章要完成什么：场景、人物状态、情绪变化、需要保留的细节、不要越界的地方。"
                : "写下本次要继续或修正什么：场景、人物状态、情绪变化、需要保留的细节、不要越界的地方。"
            }
            disabled={isRunning}
            className="h-36 w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-3 text-sm leading-6 text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 text-xs text-ink-500">{userIdeas.length} 字</div>
        </section>

        {sampleLibs.length > 0 ? (
          <SampleReferencePicker
            libs={sampleLibs}
            selectedIds={selectedSampleLibIds}
            onChange={setSelectedSampleLibIds}
            disabled={isRunning}
            className="mb-4"
          />
        ) : null}

        <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-200">
              <Settings2 className="h-4 w-4 text-ink-400" />
              模型与长度
            </div>
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-ink-800"
            >
              {advanced ? "收起高级" : "高级"}
              <ChevronDown className={`h-3.5 w-3.5 transition ${advanced ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-2">
            <select
              aria-label="选择 AI 写作使用的模型服务"
              value={primaryProviderId}
              onChange={(event) => {
                const id = event.target.value;
                setPrimaryProviderId(id);
                const provider = providers.find((item) => item.id === id);
                if (provider) setPrimaryModel(provider.defaultModel);
              }}
              disabled={isRunning}
              className="h-9 rounded-md border border-ink-700 bg-ink-950 px-2 text-sm"
            >
              <option value="">选择模型服务</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <input
              aria-label="AI 写作使用的模型名称"
              type="text"
              value={primaryModel}
              onChange={(event) => setPrimaryModel(event.target.value)}
              placeholder="模型名称"
              disabled={isRunning}
              className="h-9 rounded-md border border-ink-700 bg-ink-950 px-2 text-sm"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-ink-700 bg-ink-950/55 p-1 text-xs">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => {
                setSpeedMode(AUTO_WRITER_FAST_PRESET.speedMode);
                setTargetSegmentLength(AUTO_WRITER_FAST_PRESET.targetSegmentLength);
                setMaxSegments(AUTO_WRITER_FAST_PRESET.maxSegments);
                setMaxRewrites(AUTO_WRITER_FAST_PRESET.maxRewritesPerSegment);
                setEnableOocGate(AUTO_WRITER_FAST_PRESET.enableOocGate);
              }}
              className={`rounded px-3 py-2 text-left transition-colors ${
                speedMode === "fast"
                  ? "bg-accent-500/20 text-accent-200"
                  : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
              } disabled:opacity-60`}
            >
              <span className="block font-medium">快速出稿</span>
              <span className="mt-0.5 block text-[11px] opacity-80">跳过逐段校阅，适合 5000 字长章</span>
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => {
                setSpeedMode(AUTO_WRITER_DEFAULTS.speedMode);
                setTargetSegmentLength(AUTO_WRITER_DEFAULTS.targetSegmentLength);
                setMaxSegments(AUTO_WRITER_DEFAULTS.maxSegments);
                setMaxRewrites(AUTO_WRITER_DEFAULTS.maxRewritesPerSegment);
                setEnableOocGate(AUTO_WRITER_DEFAULTS.enableOocGate);
              }}
              className={`rounded px-3 py-2 text-left transition-colors ${
                speedMode === "quality"
                  ? "bg-accent-500/20 text-accent-200"
                  : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
              } disabled:opacity-60`}
            >
              <span className="block font-medium">严谨校阅</span>
              <span className="mt-0.5 block text-[11px] opacity-80">保留逐段校阅、重写与整理</span>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <NumberField
              label="每段字数"
              value={targetSegmentLength}
              min={AUTO_WRITER_PARAMETER_LIMITS.targetSegmentLength.min}
              max={AUTO_WRITER_PARAMETER_LIMITS.targetSegmentLength.max}
              step={50}
              disabled={isRunning}
              onChange={(value) => setTargetSegmentLength(value || AUTO_WRITER_DEFAULTS.targetSegmentLength)}
            />
            <NumberField
              label="段数"
              value={maxSegments}
              min={AUTO_WRITER_PARAMETER_LIMITS.maxSegments.min}
              max={12}
              step={1}
              disabled={isRunning}
              onChange={(value) => setMaxSegments(value || AUTO_WRITER_DEFAULTS.maxSegments)}
            />
            <NumberField
              label="重写上限"
              value={maxRewrites}
              min={AUTO_WRITER_PARAMETER_LIMITS.maxRewritesPerSegment.min}
              max={AUTO_WRITER_PARAMETER_LIMITS.maxRewritesPerSegment.max}
              step={1}
              disabled={isRunning}
              onChange={(value) => setMaxRewrites(value || AUTO_WRITER_DEFAULTS.maxRewritesPerSegment)}
            />
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-ink-300">
            <input
              aria-label="启用一致性检查"
              type="checkbox"
              checked={enableOocGate}
              onChange={(event) => setEnableOocGate(event.target.checked)}
              disabled={isRunning}
              className="accent-accent-500"
            />
            启用一致性检查，不通过时自动重写
          </label>

          {advanced ? (
            <div className="mt-3 space-y-2 rounded-md border border-ink-700 bg-ink-950 p-3">
              {(Object.keys(ROLE_LABELS) as AutoWriterAgentRole[]).map((role) => {
                const binding = agentBindings[role];
                return (
                  <div key={role} className="grid grid-cols-[56px_minmax(0,1fr)_150px] gap-2 text-xs">
                    <span className="self-center text-ink-400">{ROLE_LABELS[role]}</span>
                    <select
                      aria-label={`${ROLE_LABELS[role]}使用的模型服务`}
                      value={binding?.providerId ?? ""}
                      onChange={(event) =>
                        setAgentBindings((prev) => ({
                          ...prev,
                          [role]: {
                            providerId: event.target.value,
                            model: binding?.model ?? "",
                          },
                        }))
                      }
                      disabled={isRunning}
                      className="h-8 rounded-md border border-ink-700 bg-ink-900 px-2"
                    >
                      <option value="">使用主模型</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${ROLE_LABELS[role]}使用的模型名称`}
                      type="text"
                      value={binding?.model ?? ""}
                      onChange={(event) =>
                        setAgentBindings((prev) => ({
                          ...prev,
                          [role]: {
                            providerId: binding?.providerId ?? "",
                            model: event.target.value,
                          },
                        }))
                      }
                      placeholder="模型"
                      disabled={isRunning}
                      className="h-8 rounded-md border border-ink-700 bg-ink-900 px-2"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="mb-4">
          {!isRunning ? (
            <button
              type="button"
              disabled={!canStart || startMut.isPending}
              onClick={() => startMut.mutate()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-500 text-sm font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-45"
            >
              {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              {isStartingDraft ? "开始写作" : "继续写作"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopMut.mutate()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-rose-500 text-sm font-semibold text-white hover:bg-rose-400"
            >
              <Square className="h-4 w-4" />
              停止
            </button>
          )}
          {startMut.isError ? (
            <div className="mt-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              启动失败：{friendlyErrorMessage(startMut.error, "写作启动失败，请检查本章内容和模型服务后重试。")}
            </div>
          ) : null}
        </section>

        {currentPhase ? (
          <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded bg-accent-500/15 px-2 py-0.5 text-accent-200">
                {PHASE_LABELS[currentPhase.phase]}
              </span>
              <span className="text-ink-500">第 {currentPhase.segmentIndex + 1} 段</span>
              {currentPhase.rewriteCount ? (
                <span className="text-ink-500">重写 {currentPhase.rewriteCount}</span>
              ) : null}
            </div>
          </section>
        ) : null}

        {isRunning ? (
          <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
            <div className="mb-2 text-sm font-medium text-ink-200">中途补充</div>
            <textarea
              value={interruptDraft}
              onChange={(event) => setInterruptDraft(event.target.value)}
              placeholder="补充新要求，或指出刚才生成内容里的偏差。"
              className="h-20 w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-3 text-sm leading-6"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!interruptDraft.trim() || injectMut.isPending}
                onClick={() => injectMut.mutate(interruptDraft.trim())}
                className="flex h-8 items-center gap-1.5 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-45"
              >
                <Send className="h-3.5 w-3.5" />
                补充方向
              </button>
              <button
                type="button"
                disabled={!interruptDraft.trim() || correctMut.isPending}
                onClick={() => correctMut.mutate(interruptDraft.trim())}
                className="flex h-8 items-center gap-1.5 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-45"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                要求修正
              </button>
            </div>
          </section>
        ) : null}

        <section className="mb-4 space-y-2">
          {(Object.keys(ROLE_LABELS) as AutoWriterAgentRole[]).map((role) => {
            const text = streamBuffers[role];
            if (!text) return null;
            return (
              <div key={role} className="rounded-md border border-ink-700 bg-ink-900/35 p-3">
                <div className="mb-2 text-xs font-medium text-ink-400">{ROLE_LABELS[role]}</div>
                <pre className="whitespace-pre-wrap text-sm leading-6 text-ink-100">{text}</pre>
              </div>
            );
          })}
        </section>

        {doneEvent ? (
          <>
            <section
              className={`mb-4 rounded-md border p-3 text-sm ${
                doneEvent.status === "completed"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                  : doneEvent.status === "partial"
                    ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
                    : doneEvent.status === "stopped"
                      ? "border-sky-500/35 bg-sky-500/10 text-sky-100"
                      : "border-rose-500/35 bg-rose-500/10 text-rose-100"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {doneEvent.status === "completed"
                  ? "写作完成"
                  : doneEvent.status === "partial"
                    ? "部分完成"
                    : doneEvent.status === "stopped"
                      ? "已停止"
                      : "运行失败"}
              </div>
              <div className="mt-1 text-xs opacity-85">
                {doneEvent.totalSegments} 段 · 重写 {doneEvent.totalRewrites} 次 · 生成消耗：
                输入量 {doneEvent.totalTokensIn} / 输出量 {doneEvent.totalTokensOut}
              </div>
              {doneEvent.error ? (
                <div className="mt-1 text-xs">
                  失败原因：{friendlyErrorMessage(doneEvent.error, "写作中断，请稍后重试。")}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-2.5 text-xs font-medium text-ink-950 hover:bg-accent-400"
                  onClick={() => flowActions.openChapter(chapterId)}
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  打开正文
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-current/30 px-2.5 text-xs hover:bg-white/10"
                  onClick={() => flowActions.reviewChapter(chapterId)}
                >
                  <FileSearch className="h-3.5 w-3.5" />
                  审查本章
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-current/30 px-2.5 text-xs hover:bg-white/10"
                  onClick={() => flowActions.openOutline(linkedOutlineCard?.id)}
                  title={linkedOutlineCard ? `查看大纲卡：${linkedOutlineCard.title}` : "回到大纲"}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  回到大纲
                </button>
              </div>
            </section>

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
        ) : null}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink-400">{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="h-8 rounded-md border border-ink-700 bg-ink-950 px-2"
      />
    </label>
  );
}

export type { AutoWriterRunRecord };
