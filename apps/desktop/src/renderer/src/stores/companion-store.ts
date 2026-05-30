import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 桌宠状态机：
 * - idle             默认坐姿
 * - typing           跟随打字
 * - sleepy           长时间无活动
 * - cheering         达成日字数目标
 * - midnight         0-3 点写作 → 递咖啡
 * - hidden           用户主动隐藏
 * --- M8.5 新增 ---
 * - petted           被抚摸时，飘 ❤
 * - pomodoro-work    番茄钟工作中，戴眼镜认真
 * - pomodoro-break   番茄钟休息中，伸懒腰
 * - dizzy            连续点击 5 下 → 晕
 * - wishing          11:11 双击 → 许愿星粒子
 */
export type CompanionState =
  | "idle"
  | "typing"
  | "sleepy"
  | "cheering"
  | "midnight"
  | "hidden"
  | "petted"
  | "pomodoro-work"
  | "pomodoro-break"
  | "dizzy"
  | "wishing";

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

const POMODORO_INIT: PomodoroState = {
  mode: "idle",
  startedAt: 0,
  durationSec: 0,
  doneCount: 0,
};

export interface CompanionStore {
  /** ===== 持久化 ===== */
  enabled: boolean;
  posXPct: number;
  posYPct: number;
  opacity: number;

  // 养成数据
  /** 桌宠名字。空表示未起名，气泡用「我」。 */
  name: string;
  /** 心情值 0-100。抚摸 +1，每分钟自然 -0.1。 */
  mood: number;
  /** 累计被抚摸次数 */
  petCount: number;
  /** 累计被点击次数（区别于抚摸——单次点击） */
  clickCount: number;
  /** 第一次启用桌宠的日期（"陪伴 X 天"用） */
  birthDate: string | null;
  /** 用户生日（MM-DD），生日当天戴尖帽 */
  userBirthday: string | null;

  // 番茄钟
  pomodoro: PomodoroState;

  // 视觉开关
  particlesEnabled: boolean;

  // 已解锁里程碑
  unlockedMilestones: string[];

  /** ===== 运行时（不持久化） ===== */
  state: CompanionState;
  lastTypedAt: number;
  cheeredForDate: string | null;
  /** Konami code 进度（0-9） */
  konamiProgress: number;
  /** 是否已解锁彩虹皮肤 */
  rainbowUnlocked: boolean;

  /** ===== actions ===== */
  setEnabled: (v: boolean) => void;
  setPosition: (xPct: number, yPct: number) => void;
  setOpacity: (op: number) => void;
  setState: (s: CompanionState) => void;
  markTyped: () => void;
  markCheered: (dateKey: string) => void;
  setName: (name: string) => void;
  setUserBirthday: (mmdd: string | null) => void;
  setParticlesEnabled: (v: boolean) => void;
  bumpClick: () => void;
  bumpPet: () => void;
  decayMood: (delta: number) => void;
  startPomodoro: () => void;
  stopPomodoro: () => void;
  advancePomodoro: () => void;
  konamiTick: (key: string) => void;
  unlockMilestone: (id: string) => boolean;
}

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const useCompanionStore = create<CompanionStore>()(
  persist(
    (set, get) => ({
      // 持久化字段默认值
      enabled: true,
      posXPct: 0.92,
      posYPct: 0.86,
      opacity: 0.95,
      name: "",
      mood: 60,
      petCount: 0,
      clickCount: 0,
      birthDate: null,
      userBirthday: null,
      pomodoro: POMODORO_INIT,
      particlesEnabled: true,
      unlockedMilestones: [],

      // 运行时
      state: "idle",
      lastTypedAt: 0,
      cheeredForDate: null,
      konamiProgress: 0,
      rainbowUnlocked: false,

      // actions
      setEnabled: (v) =>
        set((s) => ({
          enabled: v,
          birthDate: s.birthDate ?? new Date().toISOString().slice(0, 10),
        })),
      setPosition: (xPct, yPct) =>
        set({
          posXPct: clamp(xPct, 0.02, 0.98),
          posYPct: clamp(yPct, 0.05, 0.95),
        }),
      setOpacity: (op) => set({ opacity: clamp(op, 0.4, 1) }),
      setState: (s) => set({ state: s }),
      markTyped: () => set({ lastTypedAt: Date.now(), state: "typing" }),
      markCheered: (dateKey) => set({ cheeredForDate: dateKey }),
      setName: (name) => set({ name: name.slice(0, 12).trim() }),
      setUserBirthday: (mmdd) => set({ userBirthday: mmdd }),
      setParticlesEnabled: (v) => set({ particlesEnabled: v }),
      bumpClick: () => set((s) => ({ clickCount: s.clickCount + 1 })),
      bumpPet: () =>
        set((s) => ({
          petCount: s.petCount + 1,
          mood: clamp(s.mood + 1.2, 0, 100),
        })),
      decayMood: (delta) =>
        set((s) => ({ mood: clamp(s.mood - delta, 0, 100) })),
      startPomodoro: () =>
        set({
          pomodoro: {
            mode: "work",
            startedAt: Date.now(),
            durationSec: 25 * 60,
            doneCount: get().pomodoro.doneCount,
          },
          state: "pomodoro-work",
        }),
      stopPomodoro: () =>
        set({ pomodoro: { ...POMODORO_INIT, doneCount: get().pomodoro.doneCount }, state: "idle" }),
      advancePomodoro: () => {
        const cur = get().pomodoro;
        if (cur.mode === "work") {
          set({
            pomodoro: {
              mode: "break",
              startedAt: Date.now(),
              durationSec: 5 * 60,
              doneCount: cur.doneCount + 1,
            },
            state: "pomodoro-break",
          });
        } else if (cur.mode === "break") {
          set({
            pomodoro: {
              mode: "work",
              startedAt: Date.now(),
              durationSec: 25 * 60,
              doneCount: cur.doneCount,
            },
            state: "pomodoro-work",
          });
        }
      },
      konamiTick: (key) =>
        set((s) => {
          const expect = KONAMI[s.konamiProgress];
          if (key === expect) {
            const nxt = s.konamiProgress + 1;
            if (nxt >= KONAMI.length) {
              return { konamiProgress: 0, rainbowUnlocked: true };
            }
            return { konamiProgress: nxt };
          }
          // 重置；如果按错的就是开头，则保留 1
          return { konamiProgress: key === KONAMI[0] ? 1 : 0 };
        }),
      unlockMilestone: (id) => {
        const s = get();
        if (s.unlockedMilestones.includes(id)) return false;
        set({ unlockedMilestones: [...s.unlockedMilestones, id] });
        return true;
      },
    }),
    {
      name: "inkforge-companion",
      partialize: (state) => ({
        enabled: state.enabled,
        posXPct: state.posXPct,
        posYPct: state.posYPct,
        opacity: state.opacity,
        name: state.name,
        mood: state.mood,
        petCount: state.petCount,
        clickCount: state.clickCount,
        birthDate: state.birthDate,
        userBirthday: state.userBirthday,
        pomodoro: state.pomodoro,
        particlesEnabled: state.particlesEnabled,
        unlockedMilestones: state.unlockedMilestones,
      }),
    },
  ),
);
