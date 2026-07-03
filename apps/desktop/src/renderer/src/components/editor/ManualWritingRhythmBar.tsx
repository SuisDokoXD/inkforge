import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock3, MapPin, NotepadText, Plus, Target, Trash2, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import {
  formatManualWritingDuration,
  manualWritingProgressPercent,
  normalizeNextBeat,
  type ManualWritingResumeCue,
} from "../../lib/manual-writing-rhythm";
import { Badge, ProgressBar } from "../ui";

interface ManualWritingRhythmBarProps {
  focusMode: boolean;
  sessionAddedGraphemes: number;
  activeDurationMs: number;
  sessionGoal: number;
  nextBeat: string;
  resumeCue: ManualWritingResumeCue | null;
  onNextBeatChange: (value: string) => void;
  onSessionGoalChange: (value: number) => void;
  onInsertNextBeatTodo: () => void;
  onClearNextBeat: () => void;
  onJumpToResumeCue: () => void;
}

export function ManualWritingRhythmBar({
  focusMode,
  sessionAddedGraphemes,
  activeDurationMs,
  sessionGoal,
  nextBeat,
  resumeCue,
  onNextBeatChange,
  onSessionGoalChange,
  onInsertNextBeatTodo,
  onClearNextBeat,
  onJumpToResumeCue,
}: ManualWritingRhythmBarProps): JSX.Element {
  const [beatOpen, setBeatOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(sessionGoal));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const normalizedBeat = normalizeNextBeat(nextBeat);
  const progress = manualWritingProgressPercent(sessionAddedGraphemes, sessionGoal);

  useEffect(() => {
    setGoalDraft(String(sessionGoal));
  }, [sessionGoal]);

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
          className={`inline-flex h-7 max-w-64 items-center gap-1.5 rounded-md border px-2 text-xs ${
            beatOpen || normalizedBeat
              ? "border-accent-500/35 bg-accent-500/12 text-accent-100"
              : "border-ink-700 bg-ink-950/20 text-ink-300 hover:bg-ink-800"
          }`}
          onClick={() => setBeatOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={beatOpen}
          title={normalizedBeat ? `下一段：${normalizedBeat}` : "下一段便签"}
        >
          <NotepadText className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">下一段</span>
          {normalizedBeat ? <span className="min-w-0 truncate text-accent-100/75">{normalizedBeat}</span> : null}
        </button>
        <AnimatePresence initial={false}>
          {beatOpen ? (
            <motion.div
              className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-ink-200 shadow-xl backdrop-blur"
              role="dialog"
              aria-label="下一段便签"
              variants={panelMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-ink-200">下一段</span>
                <button
                  type="button"
                  className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  onClick={() => setBeatOpen(false)}
                  title="关闭"
                  aria-label="关闭下一段便签"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                aria-label="下一段要写什么"
                value={nextBeat}
                onChange={(event) => onNextBeatChange(event.currentTarget.value)}
                placeholder="下一段要写什么"
                className="h-24 w-full resize-none rounded-md border border-ink-700 bg-ink-950/85 p-2 text-sm leading-6 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/60"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <Badge tone={normalizedBeat ? "accent" : "neutral"} className="rounded px-1.5 font-normal">
                  {normalizedBeat.length}/120
                </Badge>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ink-400 hover:bg-ink-800 hover:text-rose-200 disabled:opacity-40"
                    onClick={onClearNextBeat}
                    disabled={!normalizedBeat}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    清空
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-500/20 px-2 text-accent-100 hover:bg-accent-500/30 disabled:opacity-40"
                    onClick={onInsertNextBeatTodo}
                    disabled={!normalizedBeat}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    插入待补
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
