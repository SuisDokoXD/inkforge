// C5: 写作冲刺 / Pomodoro 面板——利用已有的 companion-store 番茄钟状态机，
// 提供一个可见的倒计时器、当前冲刺字数和历史记录。
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Clock, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useCompanionStore } from "../stores/companion-store";
import { useAppStore } from "../stores/app-store";
import { DUR, EASE_STANDARD, fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { Button, IconButton } from "./ui";

interface PomodoroTimerProps {
  onClose: () => void;
}

interface SprintRecord {
  startedAt: number;
  endedAt: number;
  wordsWritten: number;
}

/** 把秒数格式化为 MM:SS */
function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroTimer({ onClose }: PomodoroTimerProps): JSX.Element {
  const reduce = useReducedMotion();
  const motionVariants = reduce ? fadeOnly : fadeSlideUp;

  // 从 companion store 读取番茄钟状态
  const pomodoro = useCompanionStore((s) => s.pomodoro);
  const startPomodoro = useCompanionStore((s) => s.startPomodoro);
  const stopPomodoro = useCompanionStore((s) => s.stopPomodoro);
  const advancePomodoro = useCompanionStore((s) => s.advancePomodoro);

  // 读取当前字数（冲刺开始时记录基线，实时显示增量）
  const chapterStats = useAppStore((s) => s.currentChapterStats);
  const [sprintBaseline, setSprintBaseline] = useState(0);
  const [history, setHistory] = useState<SprintRecord[]>([]);

  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = pomodoro.mode === "work" || pomodoro.mode === "break";
  const remaining = Math.max(0, pomodoro.durationSec - elapsed);
  const progress = pomodoro.durationSec > 0
    ? Math.min(100, Math.round((elapsed / pomodoro.durationSec) * 100))
    : 0;
  const phaseLabel = pomodoro.mode === "work" ? "专注写作" : "休息";
  const phaseColor = pomodoro.mode === "work" ? "bg-accent-500" : "bg-emerald-500";
  const phaseTextColor = pomodoro.mode === "work" ? "text-accent-300" : "text-emerald-300";

  // 当前冲刺字数（相对于基线）
  const currentGraphemes = chapterStats?.graphemes ?? 0;
  const sprintWords = isRunning ? Math.max(0, currentGraphemes - sprintBaseline) : 0;

  // 计时器
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - pomodoro.startedAt) / 1000));
    };
    tick();
    intervalRef.current = setInterval(tick, 500);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [isRunning, pomodoro.startedAt]);

  // 自动推进（时间到）
  useEffect(() => {
    if (!isRunning || elapsed < pomodoro.durationSec) return;
    advancePomodoro();
    setElapsed(0);
  }, [isRunning, elapsed, pomodoro.durationSec, advancePomodoro]);

  // 字数基线
  useEffect(() => {
    if (pomodoro.mode === "work" && sprintBaseline === 0 && currentGraphemes > 0) {
      setSprintBaseline(currentGraphemes);
    }
  }, [pomodoro.mode, currentGraphemes, sprintBaseline]);

  const handleStart = () => {
    if (pomodoro.mode === "work") {
      // 已经在工作状态，跳过
      return;
    }
    setSprintBaseline(currentGraphemes);
    startPomodoro();
  };

  const handleStop = () => {
    if (pomodoro.mode === "work") {
      // 完成一个冲刺，记录历史
      setHistory((prev) =>
        [{ startedAt: pomodoro.startedAt, endedAt: Date.now(), wordsWritten: sprintWords }, ...prev].slice(0, 20),
      );
    }
    setSprintBaseline(0);
    stopPomodoro();
  };

  const totalHistoryWords = useMemo(() => history.reduce((sum, r) => sum + r.wordsWritten, 0), [history]);
  const totalDone = pomodoro.doneCount + (isRunning ? 0 : 0);

  return (
    <motion.div
      className="flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
      style={{ width: 320, maxHeight: "min(520px, 82vh)" }}
      variants={motionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <Timer className={`h-4 w-4 ${phaseTextColor}`} />
          <span className="text-sm font-semibold text-ink-100">写作冲刺</span>
        </div>
        <div className="flex items-center gap-1">
          {isRunning ? (
            <IconButton size="xs" aria-label="停止冲刺" onClick={handleStop}>
              <Pause className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <IconButton size="xs" aria-label="开始 25 分钟冲刺" onClick={handleStart}>
              <Play className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton size="xs" aria-label="关闭冲刺面板" onClick={onClose}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      {/* Timer display */}
      <div className="flex flex-col items-center px-4 py-6">
        {isRunning ? (
          <>
            <div className={`text-4xl font-mono font-bold tabular-nums ${phaseTextColor}`}>
              {fmtTime(remaining)}
            </div>
            <div className="mt-1 text-xs text-ink-500">{phaseLabel} · {totalDone + 1} 轮</div>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
              <motion.div
                className={`h-full rounded-full ${phaseColor}`}
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: reduce ? 0 : DUR.base, ease: EASE_STANDARD }}
              />
            </div>
            {/* Sprint word count */}
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink-100">{sprintWords.toLocaleString()}</span>
              <span className="text-xs text-ink-500">字/本轮</span>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="text-3xl font-mono font-bold text-ink-300">25:00</div>
            <div className="mt-2 text-xs text-ink-500">
              按 ▶ 开始专注写作 · 每轮 25 分钟
            </div>
            <div className="mt-2 text-xs text-ink-400">
              已完成 {totalDone} 轮 · 本书冲刺 {totalHistoryWords.toLocaleString()} 字
            </div>
            <Button
              size="md"
              variant="primary"
              className="mt-3 w-full"
              onClick={handleStart}
            >
              <Play className="h-4 w-4" />
              开始写作冲刺 (25 分钟)
            </Button>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto border-t border-ink-700 scrollbar-thin">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-ink-500">本轮历史</div>
          <ul className="divide-y divide-ink-700/70">
            {history.slice(0, 6).map((r, i) => {
              const durationMin = Math.round((r.endedAt - r.startedAt) / 60000);
              return (
                <li key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-ink-400">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {durationMin} 分钟
                  </span>
                  <span className="text-ink-200">{r.wordsWritten.toLocaleString()} 字</span>
                  <span className="text-ink-500">
                    {new Date(r.endedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </motion.div>
  );
}
