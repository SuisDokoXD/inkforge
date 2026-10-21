// C5: 写作冲刺（番茄钟）状态机。原先寄居在桌宠 store 里，桌宠下线后拆为独立 store。
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 番茄钟模式 */
export type PomodoroMode = "idle" | "work" | "break";

export interface PomodoroState {
  mode: PomodoroMode;
  /** 本轮开始的时间戳（ms）；idle 时为 0 */
  startedAt: number;
  /** 本轮持续秒数（work=1500, break=300） */
  durationSec: number;
  /** 累计完成的工作番茄数（不重置） */
  doneCount: number;
}

const WORK_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

const POMODORO_INIT: PomodoroState = {
  mode: "idle",
  startedAt: 0,
  durationSec: 0,
  doneCount: 0,
};

export interface PomodoroStore {
  pomodoro: PomodoroState;
  startPomodoro: () => void;
  stopPomodoro: () => void;
  advancePomodoro: () => void;
}

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => ({
      pomodoro: POMODORO_INIT,
      startPomodoro: () =>
        set({
          pomodoro: {
            mode: "work",
            startedAt: Date.now(),
            durationSec: WORK_SEC,
            doneCount: get().pomodoro.doneCount,
          },
        }),
      stopPomodoro: () =>
        set({ pomodoro: { ...POMODORO_INIT, doneCount: get().pomodoro.doneCount } }),
      advancePomodoro: () => {
        const cur = get().pomodoro;
        if (cur.mode === "work") {
          set({
            pomodoro: {
              mode: "break",
              startedAt: Date.now(),
              durationSec: BREAK_SEC,
              doneCount: cur.doneCount + 1,
            },
          });
        } else if (cur.mode === "break") {
          set({
            pomodoro: {
              mode: "work",
              startedAt: Date.now(),
              durationSec: WORK_SEC,
              doneCount: cur.doneCount,
            },
          });
        }
      },
    }),
    {
      name: "inkforge-pomodoro",
      partialize: (state) => ({ pomodoro: state.pomodoro }),
    },
  ),
);
