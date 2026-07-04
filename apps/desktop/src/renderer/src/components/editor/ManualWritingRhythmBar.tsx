import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  CornerDownRight,
  ListChecks,
  MapPin,
  NotepadText,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import {
  MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH,
  MANUAL_RHYTHM_MAX_OPEN_BEATS,
  formatManualWritingDuration,
  manualWritingProgressPercent,
  normalizeHandoffNote,
  normalizeNextBeat,
  type ManualWritingBeatItem,
  type ManualWritingResumeCue,
} from "../../lib/manual-writing-rhythm";
import { Badge, ProgressBar } from "../ui";

interface ManualWritingRhythmBarProps {
  focusMode: boolean;
  sessionAddedGraphemes: number;
  activeDurationMs: number;
  sessionGoal: number;
  beatQueue: ManualWritingBeatItem[];
  handoffNote: string;
  resumeCue: ManualWritingResumeCue | null;
  onAddBeat: (text: string) => void;
  onUpdateBeat: (id: string, text: string) => void;
  onCompleteBeat: (id: string) => void;
  onReopenBeat: (id: string) => void;
  onDeleteBeat: (id: string) => void;
  onMoveBeat: (id: string, direction: "up" | "down") => void;
  onInsertBeatTodo: (id: string) => void;
  onHandoffNoteChange: (value: string) => void;
  onSessionGoalChange: (value: number) => void;
  onJumpToResumeCue: () => void;
}

export function ManualWritingRhythmBar({
  focusMode,
  sessionAddedGraphemes,
  activeDurationMs,
  sessionGoal,
  beatQueue,
  handoffNote,
  resumeCue,
  onAddBeat,
  onUpdateBeat,
  onCompleteBeat,
  onReopenBeat,
  onDeleteBeat,
  onMoveBeat,
  onInsertBeatTodo,
  onHandoffNoteChange,
  onSessionGoalChange,
  onJumpToResumeCue,
}: ManualWritingRhythmBarProps): JSX.Element {
  const [beatOpen, setBeatOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(sessionGoal));
  const [addDraft, setAddDraft] = useState("");
  const [beatDrafts, setBeatDrafts] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const progress = manualWritingProgressPercent(sessionAddedGraphemes, sessionGoal);
  const openBeats = useMemo(() => beatQueue.filter((item) => item.status === "open"), [beatQueue]);
  const doneBeats = useMemo(() => beatQueue.filter((item) => item.status === "done"), [beatQueue]);
  const firstOpenBeat = openBeats[0] ?? null;
  const normalizedAddDraft = normalizeNextBeat(addDraft);
  const normalizedHandoffNote = normalizeHandoffNote(handoffNote);
  const canAddBeat = openBeats.length < MANUAL_RHYTHM_MAX_OPEN_BEATS;

  useEffect(() => {
    setGoalDraft(String(sessionGoal));
  }, [sessionGoal]);

  useEffect(() => {
    setBeatDrafts((current) => {
      const next: Record<string, string> = {};
      for (const item of beatQueue) {
        if (Object.prototype.hasOwnProperty.call(current, item.id)) next[item.id] = current[item.id] ?? "";
      }
      return next;
    });
  }, [beatQueue]);

  useEffect(() => {
    if (!beatOpen) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setBeatOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [beatOpen]);

  const commitGoal = () => {
    const next = Number(goalDraft);
    if (Number.isFinite(next)) {
      onSessionGoalChange(next);
      return;
    }
    setGoalDraft(String(sessionGoal));
  };

  const addBeat = () => {
    if (!normalizedAddDraft || !canAddBeat) return;
    onAddBeat(normalizedAddDraft);
    setAddDraft("");
  };

  const commitBeatDraft = (item: ManualWritingBeatItem) => {
    if (!Object.prototype.hasOwnProperty.call(beatDrafts, item.id)) return;
    const draft = beatDrafts[item.id] ?? "";
    const normalizedDraft = normalizeNextBeat(draft);
    setBeatDrafts((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    if (normalizedDraft && normalizedDraft !== item.text) onUpdateBeat(item.id, normalizedDraft);
  };

  const renderBeatItem = (item: ManualWritingBeatItem, index: number, total: number): JSX.Element => {
    const draftValue = Object.prototype.hasOwnProperty.call(beatDrafts, item.id)
      ? beatDrafts[item.id] ?? ""
      : item.text;
    const isDone = item.status === "done";
    return (
      <li
        key={item.id}
        className={`rounded-md border p-2 ${
          isDone
            ? "border-ink-800 bg-ink-950/30 text-ink-500"
            : "border-ink-700/80 bg-ink-950/50 text-ink-200"
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
              isDone
                ? "border-ink-700 text-ink-500 hover:bg-ink-800 hover:text-ink-100"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            }`}
            onClick={() => (isDone ? onReopenBeat(item.id) : onCompleteBeat(item.id))}
            aria-label={isDone ? `恢复接力：${item.text}` : `完成接力：${item.text}`}
            title={isDone ? "恢复" : "完成"}
          >
            {isDone ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <textarea
            aria-label={isDone ? "已完成接力内容" : "接力内容"}
            value={draftValue}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setBeatDrafts((current) => ({ ...current, [item.id]: value }));
            }}
            onBlur={() => commitBeatDraft(item)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                commitBeatDraft(item);
              }
            }}
            className={`min-h-12 flex-1 resize-none rounded-md border px-2 py-1.5 text-sm leading-5 outline-none ${
              isDone
                ? "border-ink-800 bg-ink-950/45 text-ink-400 line-through decoration-ink-600 focus:border-ink-600"
                : "border-ink-700 bg-ink-950/85 text-ink-100 focus:border-accent-500/60"
            }`}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 pl-9">
          <Badge tone={isDone ? "neutral" : "accent"} className="rounded px-1.5 font-normal">
            {isDone ? "已完成" : "未完成"}
          </Badge>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-35"
              onClick={() => onInsertBeatTodo(item.id)}
              disabled={isDone}
              aria-label={`插入待补：${item.text}`}
              title="插入待补"
            >
              <CornerDownRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-35"
              onClick={() => onMoveBeat(item.id, "up")}
              disabled={index === 0}
              aria-label={`上移接力：${item.text}`}
              title="上移"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-35"
              onClick={() => onMoveBeat(item.id, "down")}
              disabled={index >= total - 1}
              aria-label={`下移接力：${item.text}`}
              title="下移"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-rose-200"
              onClick={() => onDeleteBeat(item.id)}
              aria-label={`删除接力：${item.text}`}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div
      className={`flex min-h-10 flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900/35 px-4 py-2 text-xs text-ink-300 transition-opacity duration-200 ${
        focusMode ? "opacity-40 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-700/70 bg-ink-950/25 px-2 tabular-nums">
          <NotepadText className="h-3.5 w-3.5 text-accent-300" />
          本次 +{Math.max(0, sessionAddedGraphemes)} 字
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-700/70 bg-ink-950/25 px-2 tabular-nums">
          <Clock3 className="h-3.5 w-3.5 text-ink-500" />
          连写 {formatManualWritingDuration(activeDurationMs)}
        </span>
        <label className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-700/70 bg-ink-950/25 px-2">
          <Target className="h-3.5 w-3.5 text-ink-500" />
          <span>目标</span>
          <input
            type="number"
            min={100}
            max={10000}
            step={100}
            aria-label="本次写作目标字数"
            className="h-5 w-14 rounded border border-ink-700 bg-ink-900 px-1 text-right tabular-nums text-ink-100 outline-none focus:border-accent-500"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.currentTarget.value)}
            onBlur={commitGoal}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitGoal();
              }
            }}
          />
          <ProgressBar value={progress} label="本次写作目标进度" className="h-1 w-16" />
        </label>
        {resumeCue ? (
          <button
            type="button"
            className="inline-flex h-7 min-w-0 max-w-sm items-center gap-1.5 rounded-md border border-accent-500/25 bg-accent-500/10 px-2 text-accent-100 hover:bg-accent-500/15"
            onClick={onJumpToResumeCue}
            title={`第 ${resumeCue.line} 行：${resumeCue.text}`}
            aria-label={`跳回上次停笔位置，第 ${resumeCue.line} 行`}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">第 {resumeCue.line} 行</span>
            <span className="min-w-0 truncate text-accent-100/75">{resumeCue.text}</span>
          </button>
        ) : null}
      </div>

      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          className={`inline-flex h-7 max-w-80 items-center gap-1.5 rounded-md border px-2 text-xs ${
            beatOpen || firstOpenBeat
              ? "border-accent-500/35 bg-accent-500/12 text-accent-100"
              : "border-ink-700 bg-ink-950/20 text-ink-300 hover:bg-ink-800"
          }`}
          onClick={() => setBeatOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={beatOpen}
          title={firstOpenBeat ? `接力：${firstOpenBeat.text}` : "写作接力"}
        >
          <ListChecks className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">接力</span>
          <Badge tone={openBeats.length > 0 ? "accent" : "neutral"} className="rounded px-1.5 font-normal">
            {openBeats.length}
          </Badge>
          {firstOpenBeat ? <span className="min-w-0 truncate text-accent-100/75">{firstOpenBeat.text}</span> : null}
        </button>
        <AnimatePresence initial={false}>
          {beatOpen ? (
            <motion.div
              className="absolute right-0 top-full z-30 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-ink-200 shadow-xl backdrop-blur"
              role="dialog"
              aria-label="写作接力"
              variants={panelMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-ink-100">
                    <ListChecks className="h-3.5 w-3.5 text-accent-300" />
                    写作接力
                    <Badge tone={openBeats.length > 0 ? "accent" : "neutral"} className="rounded px-1.5 font-normal">
                      {openBeats.length}/{MANUAL_RHYTHM_MAX_OPEN_BEATS}
                    </Badge>
                  </div>
                  {firstOpenBeat ? (
                    <div className="mt-1 truncate text-[11px] text-ink-400" title={firstOpenBeat.text}>
                      当前：{firstOpenBeat.text}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  onClick={() => setBeatOpen(false)}
                  title="关闭"
                  aria-label="关闭写作接力"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {resumeCue || normalizedHandoffNote ? (
                <div className="mb-3 space-y-1 rounded-md border border-ink-800 bg-ink-950/35 p-2 text-[11px] text-ink-400">
                  {resumeCue ? (
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-1.5 text-left text-accent-100 hover:text-accent-50"
                      onClick={onJumpToResumeCue}
                      title={`第 ${resumeCue.line} 行：${resumeCue.text}`}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="shrink-0">继续：第 {resumeCue.line} 行</span>
                      <span className="min-w-0 truncate text-accent-100/70">{resumeCue.text}</span>
                    </button>
                  ) : null}
                  {normalizedHandoffNote ? (
                    <div className="truncate" title={normalizedHandoffNote}>收工：{normalizedHandoffNote}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-start gap-2">
                <textarea
                  aria-label="新增写作接力"
                  value={addDraft}
                  onChange={(event) => setAddDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      addBeat();
                    }
                  }}
                  placeholder="下一段要写什么"
                  className="h-16 flex-1 resize-none rounded-md border border-ink-700 bg-ink-950/85 p-2 text-sm leading-5 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/60 disabled:opacity-50"
                  disabled={!canAddBeat}
                />
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-500/20 text-accent-100 hover:bg-accent-500/30 disabled:opacity-40"
                  onClick={addBeat}
                  disabled={!normalizedAddDraft || !canAddBeat}
                  aria-label="新增接力"
                  title="新增"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 max-h-[22rem] overflow-auto pr-1 scrollbar-thin">
                {openBeats.length > 0 ? (
                  <ol className="space-y-2">
                    {openBeats.map((item, index) => renderBeatItem(item, index, openBeats.length))}
                  </ol>
                ) : (
                  <div className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-center text-ink-500">
                    暂无接力
                  </div>
                )}

                {doneBeats.length > 0 ? (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-500">
                      <span>已完成</span>
                      <span>{doneBeats.length}</span>
                    </div>
                    <ol className="space-y-2">
                      {doneBeats.map((item, index) => renderBeatItem(item, index, doneBeats.length))}
                    </ol>
                  </div>
                ) : null}
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] text-ink-400">收工备注</span>
                <textarea
                  aria-label="收工备注"
                  value={handoffNote}
                  onChange={(event) => onHandoffNoteChange(event.currentTarget.value)}
                  placeholder="停在哪里，下一次从哪接"
                  className="h-16 w-full resize-none rounded-md border border-ink-700 bg-ink-950/85 p-2 text-sm leading-5 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/60"
                />
                <span className="mt-1 block text-right text-[10px] text-ink-500">
                  {normalizedHandoffNote.length}/{MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH}
                </span>
              </label>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
