import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useCompanionStore } from "../../stores/companion-store";
import { CompanionBubble } from "./CompanionBubble";
import { CompanionChat } from "./CompanionChat";
import { CompanionFestiveOverlay } from "./CompanionFestiveOverlay";
import { CompanionParticles } from "./CompanionParticles";
import { CompanionPomodoroRing } from "./CompanionPomodoroRing";
import { CompanionLottie } from "./CompanionLottie";
import { AnimatedDialog } from "../AnimatedDialog";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  tapPress,
} from "../../lib/motion-tokens";
import {
  pickFestivalLine,
  pickLine,
  type BubbleKind,
} from "./companion-lines";
import {
  detectFestival,
  FESTIVAL_LABEL,
  type FestivalKey,
} from "./companion-festivals";
import {
  applyPersona,
  PET_DEFAULT_NAME,
} from "./companion-persona";

const TYPING_TIMEOUT_MS = 1500;
const SLEEPY_TIMEOUT_MS = 5 * 60 * 1000;
const BUBBLE_VISIBLE_MS = 4500;
const SPRITE_SIZE = 64;
const PETTING_END_DELAY_MS = 700;
const DIZZY_RESET_MS = 2200;
const WISHING_RESET_MS = 5000;
const QUICK_CLICK_WINDOW_MS = 1500;
const QUICK_CLICK_THRESHOLD = 5;
const MOOD_DECAY_PER_MIN = 0.1;
/** 11:11 上下午两次 */
const WISH_HOURS = [11, 23];

/**
 * 桌宠主组件 —— M8.5 升级版。
 *
 * 新增交互：
 *   - 单击：触发 click count + 检查 5 连击 → dizzy
 *   - 双击：开/关番茄钟（25/5 制）
 *   - Alt+Click：打开 AI 聊天面板
 *   - 长按拖动头部 ≥250ms：进入 petted 状态，飘 ❤
 *   - Konami code（全局键盘）：解锁彩虹皮肤
 *   - 11:11 双击 → 许愿模式
 *   - 节日自动佩戴装饰
 *   - 心情自然衰减；抚摸提升心情
 *   - 环境粒子（季节/时段自适应）
 */
export function Companion({
  dailyAchieved,
}: {
  dailyAchieved: boolean;
}): JSX.Element | null {
  // 持久化
  const enabled = useCompanionStore((s) => s.enabled);
  const name = useCompanionStore((s) => s.name);
  const opacity = useCompanionStore((s) => s.opacity);
  const posXPct = useCompanionStore((s) => s.posXPct);
  const posYPct = useCompanionStore((s) => s.posYPct);
  const userBirthday = useCompanionStore((s) => s.userBirthday);
  const particlesEnabled = useCompanionStore((s) => s.particlesEnabled);
  const mood = useCompanionStore((s) => s.mood);
  const petCount = useCompanionStore((s) => s.petCount);
  const pomodoro = useCompanionStore((s) => s.pomodoro);
  const rainbowUnlocked = useCompanionStore((s) => s.rainbowUnlocked);
  const birthDate = useCompanionStore((s) => s.birthDate);

  // 运行时
  const state = useCompanionStore((s) => s.state);
  const lastTypedAt = useCompanionStore((s) => s.lastTypedAt);
  const cheeredForDate = useCompanionStore((s) => s.cheeredForDate);

  // actions
  const setState = useCompanionStore((s) => s.setState);
  const markTyped = useCompanionStore((s) => s.markTyped);
  const setPosition = useCompanionStore((s) => s.setPosition);
  const setOpacity = useCompanionStore((s) => s.setOpacity);
  const setEnabled = useCompanionStore((s) => s.setEnabled);
  const setName = useCompanionStore((s) => s.setName);
  const setUserBirthday = useCompanionStore((s) => s.setUserBirthday);
  const setParticlesEnabled = useCompanionStore((s) => s.setParticlesEnabled);
  const bumpClick = useCompanionStore((s) => s.bumpClick);
  const bumpPet = useCompanionStore((s) => s.bumpPet);
  const decayMood = useCompanionStore((s) => s.decayMood);
  const startPomodoro = useCompanionStore((s) => s.startPomodoro);
  const stopPomodoro = useCompanionStore((s) => s.stopPomodoro);
  const markCheered = useCompanionStore((s) => s.markCheered);
  const konamiTick = useCompanionStore((s) => s.konamiTick);

  const [hovered, setHovered] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pX: number; pY: number; movedPx: number } | null>(
    null,
  );
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pettingRef = useRef(false);
  const clickTimestampsRef = useRef<number[]>([]);
  const lastClickTimeRef = useRef(0);
  const dblTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cheerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const festival = detectFestival(new Date(), userBirthday);

  const clearCheerTimer = (): void => {
    if (cheerTimerRef.current) {
      clearTimeout(cheerTimerRef.current);
      cheerTimerRef.current = null;
    }
  };

  const clearTransientStateTimer = (): void => {
    if (transientStateTimerRef.current) {
      clearTimeout(transientStateTimerRef.current);
      transientStateTimerRef.current = null;
    }
  };

  const scheduleTransientIdle = (delayMs: number): void => {
    clearTransientStateTimer();
    transientStateTimerRef.current = setTimeout(() => {
      transientStateTimerRef.current = null;
      setState("idle");
    }, delayMs);
  };

  useEffect(
    () => () => {
      clearCheerTimer();
      clearTransientStateTimer();
      if (dblTimerRef.current) clearTimeout(dblTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (enabled) return;
    clearCheerTimer();
    clearTransientStateTimer();
    if (dblTimerRef.current) {
      clearTimeout(dblTimerRef.current);
      dblTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setBubble(null);
  }, [enabled]);

  // ----- 全局打字监听 -----
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      // Konami code 监听（不依赖普通字符）
      konamiTick(e.key);
      if (e.key.length === 1 || ["Backspace", "Enter", "Tab"].includes(e.key)) {
        markTyped();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, markTyped, konamiTick]);

  // ----- 状态机 tick -----
  useEffect(() => {
    if (!enabled) return;
    const tick = (): void => {
      const now = Date.now();
      const hour = new Date().getHours();
      const todayKey = new Date().toISOString().slice(0, 10);

      // 锁定状态：番茄 / 抚摸 / 晕 / 许愿 不被覆盖
      if (
        pomodoro.mode === "work" ||
        pomodoro.mode === "break"
      ) {
        return; // 番茄钟时段由 pomodoro state 驱动
      }
      if (
        state === "petted" ||
        state === "dizzy" ||
        state === "wishing"
      ) {
        return;
      }

      if (dailyAchieved && cheeredForDate !== todayKey) {
        setState("cheering");
        clearCheerTimer();
        cheerTimerRef.current = setTimeout(() => {
          cheerTimerRef.current = null;
          markCheered(todayKey);
        }, 30_000);
        return;
      }
      if (state === "cheering") return;
      if (hour >= 0 && hour < 3) {
        setState("midnight");
        return;
      }
      if (lastTypedAt > 0 && now - lastTypedAt < TYPING_TIMEOUT_MS) return;
      if (lastTypedAt > 0 && now - lastTypedAt >= SLEEPY_TIMEOUT_MS) {
        setState("sleepy");
        return;
      }
      setState("idle");
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [
    enabled,
    state,
    lastTypedAt,
    dailyAchieved,
    cheeredForDate,
    pomodoro.mode,
    setState,
    markCheered,
  ]);

  // ----- 心情自然衰减（每分钟 -0.1）-----
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      decayMood(MOOD_DECAY_PER_MIN);
    }, 60_000);
    return () => clearInterval(id);
  }, [enabled, decayMood]);

  // ----- pomodoro mode 同步状态 -----
  useEffect(() => {
    if (pomodoro.mode === "work") setState("pomodoro-work");
    else if (pomodoro.mode === "break") setState("pomodoro-break");
  }, [pomodoro.mode, setState]);

  // ----- hover 自动弹气泡 -----
  useEffect(() => {
    if (!hovered) {
      setBubble(null);
      return;
    }
    const kind: BubbleKind = (() => {
      if (state === "petted") return "petted";
      if (state === "pomodoro-work") return "pomodoro-work";
      if (state === "pomodoro-break") return "pomodoro-break";
      if (state === "dizzy") return "dizzy";
      if (state === "wishing") return "wishing";
      if (state === "cheering") return "cheering";
      if (state === "sleepy") return "sleepy";
      if (state === "midnight") return "midnight";
      if (state === "typing") return "typing";
      return "idle";
    })();

    let raw: string | null = null;
    // 节日话术优先（idle 状态）
    if (festival && kind === "idle") {
      raw = pickFestivalLine(festival);
    }
    if (!raw) raw = pickLine(kind);
    setBubble(applyPersona(raw, name));
    const t = setTimeout(() => setBubble(null), BUBBLE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [hovered, state, festival, name]);

  // ----- 实时计算精灵屏幕坐标 -----
  useEffect(() => {
    let raf = 0;
    const compute = (): void => {
      setAnchor({
        x: posXPct * window.innerWidth,
        y: posYPct * window.innerHeight,
      });
    };
    // resize 用 rAF 合并到每帧一次，避免连续缩放时同步重算导致布局抖动。
    const onResize = (): void => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    compute();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [posXPct, posYPct]);

  /** 处理 5 连击 → dizzy */
  const recordClickAndCheckQuick = (): void => {
    const now = Date.now();
    const recent = [...clickTimestampsRef.current, now].filter(
      (t) => now - t < QUICK_CLICK_WINDOW_MS,
    );
    clickTimestampsRef.current = recent;
    bumpClick();
    if (recent.length >= QUICK_CLICK_THRESHOLD) {
      setState("dizzy");
      clickTimestampsRef.current = [];
      scheduleTransientIdle(DIZZY_RESET_MS);
    }
  };

  /** 双击 → pomodoro / 11:11 时双击 → wishing */
  const handleDoubleClick = (): void => {
    const now = new Date();
    if (
      WISH_HOURS.includes(now.getHours()) &&
      now.getMinutes() === 11
    ) {
      setState("wishing");
      scheduleTransientIdle(WISHING_RESET_MS);
      return;
    }
    clearTransientStateTimer();
    if (pomodoro.mode === "idle") {
      startPomodoro();
    } else {
      stopPomodoro();
    }
  };

  /** 单击/双击合并：100-280ms 区间合并为双击 */
  const handleClickIntent = (): void => {
    const now = Date.now();
    const sinceLast = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    if (dblTimerRef.current) {
      clearTimeout(dblTimerRef.current);
      dblTimerRef.current = null;
    }
    if (sinceLast < 280 && sinceLast > 30) {
      handleDoubleClick();
      return;
    }
    // 单击（延迟，等待是否双击）
    dblTimerRef.current = setTimeout(() => {
      dblTimerRef.current = null;
      recordClickAndCheckQuick();
    }, 280);
  };

  // ----- 拖拽 / 长按抚摸 -----
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return;
    if (!containerRef.current) return;

    // Alt+Click → 打开聊天
    if (e.altKey) {
      e.preventDefault();
      setChatOpen((v) => !v);
      return;
    }

    e.preventDefault();
    setMenuOpen(false);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      pX: posXPct,
      pY: posYPct,
      movedPx: 0,
    };

    // 250ms 后如果还没移动太多 → 进入 petted 状态
    longPressTimerRef.current = setTimeout(() => {
      if (
        dragStartRef.current &&
        dragStartRef.current.movedPx < 10 &&
        !pettingRef.current
      ) {
        pettingRef.current = true;
        setState("petted");
        bumpPet();
      }
    }, 250);

    const onMove = (ev: MouseEvent): void => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = (ev.clientX - start.x) / window.innerWidth;
      const dy = (ev.clientY - start.y) / window.innerHeight;
      const movePx = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      start.movedPx = Math.max(start.movedPx, movePx);

      if (pettingRef.current && movePx < 28) {
        // 抚摸不算拖拽 —— 不更新位置
        // 每 ~150ms 累计一次抚摸
        const lastPet =
          (handleMouseDown as unknown as { _lastPetAt?: number })._lastPetAt ??
          0;
        if (Date.now() - lastPet > 200) {
          (handleMouseDown as unknown as { _lastPetAt?: number })._lastPetAt =
            Date.now();
          bumpPet();
        }
        return;
      }
      // 否则 → 拖拽
      if (movePx > 6) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setPosition(start.pX + dx, start.pY + dy);
      }
    };
    const onUp = (): void => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const wasPetting = pettingRef.current;
      const movedPx = dragStartRef.current?.movedPx ?? 0;
      pettingRef.current = false;
      dragStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 抚摸结束后过一会儿恢复
      if (wasPetting) {
        scheduleTransientIdle(PETTING_END_DELAY_MS);
        return;
      }
      // 否则视为单击 → 走点击意图（仅在没有拖动时）
      if (movedPx < 6) {
        handleClickIntent();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!enabled) return null;

  const left = `${posXPct * 100}%`;
  const top = `${posYPct * 100}%`;
  const days = birthDate
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(birthDate).getTime()) / (24 * 3600 * 1000),
        ),
      )
    : 0;

  return (
    <>
      {/* 环境粒子（在精灵之下） */}
      <CompanionParticles
        centerX={anchor.x}
        centerY={anchor.y}
        enabled={particlesEnabled}
      />

      {/* 桌宠 */}
      <div
        ref={containerRef}
        className="pointer-events-none fixed z-[40] select-none"
        style={{
          left,
          top,
          transform: "translate(-50%, -50%)",
          opacity,
        }}
      >
        <div
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          title="左键点 / 双击番茄钟 / Alt+点聊天 / 长按抚摸 / 右键设置"
        >
          <div className="relative">
            <CompanionLottie state={state} hovered={hovered} />
            <CompanionFestiveOverlay
              festival={festival}
              rainbow={rainbowUnlocked}
            />
            <CompanionPomodoroRing />
          </div>
        </div>

        {/* 偏好菜单 */}
        <AnimatePresence initial={false}>
          {menuOpen && (
            <PrefMenu
              opacity={opacity}
              mood={mood}
              petCount={petCount}
              days={days}
              festival={festival}
              particlesEnabled={particlesEnabled}
              pomodoroMode={pomodoro.mode}
              pomodoroDoneCount={pomodoro.doneCount}
              rainbowUnlocked={rainbowUnlocked}
              onSetOpacity={setOpacity}
              onSetParticles={setParticlesEnabled}
              onRename={() => {
                setMenuOpen(false);
                setRenameDialogOpen(true);
              }}
              onTogglePomodoro={() => {
                if (pomodoro.mode === "idle") startPomodoro();
                else stopPomodoro();
              }}
              onChat={() => {
                setMenuOpen(false);
                setChatOpen(true);
              }}
              onClose={() => setMenuOpen(false)}
              onHide={() => {
                setEnabled(false);
                setMenuOpen(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 气泡 */}
      {bubble && (
        <CompanionBubble
          anchorX={anchor.x}
          anchorY={anchor.y}
          anchorRadius={SPRITE_SIZE / 2}
          message={bubble}
          state={state}
        />
      )}

      {/* AI 聊天 */}
      <CompanionChat
        open={chatOpen}
        petName={name}
        anchorX={anchor.x}
        anchorY={anchor.y}
        onClose={() => setChatOpen(false)}
      />

      {/* 起名对话框 */}
      <RenameDialog
        open={renameDialogOpen}
        currentName={name}
        defaultName={PET_DEFAULT_NAME}
        currentBirthday={userBirthday}
        onSave={(newName, newBirthday) => {
          setName(newName);
          setUserBirthday(newBirthday);
          setRenameDialogOpen(false);
        }}
        onCancel={() => setRenameDialogOpen(false)}
      />
    </>
  );
}

/* ============================================================
 * 子组件：偏好菜单
 * ============================================================ */

function PrefMenu({
  opacity,
  mood,
  petCount,
  days,
  festival,
  particlesEnabled,
  pomodoroMode,
  pomodoroDoneCount,
  rainbowUnlocked,
  onSetOpacity,
  onSetParticles,
  onRename,
  onTogglePomodoro,
  onChat,
  onClose,
  onHide,
}: {
  opacity: number;
  mood: number;
  petCount: number;
  days: number;
  festival: FestivalKey;
  particlesEnabled: boolean;
  pomodoroMode: "idle" | "work" | "break";
  pomodoroDoneCount: number;
  rainbowUnlocked: boolean;
  onSetOpacity: (v: number) => void;
  onSetParticles: (v: boolean) => void;
  onRename: () => void;
  onTogglePomodoro: () => void;
  onChat: () => void;
  onClose: () => void;
  onHide: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const moodLabel = (() => {
    if (mood >= 80) return "💞 心花怒放";
    if (mood >= 60) return "🌞 状态不错";
    if (mood >= 40) return "🌤 还行吧";
    if (mood >= 20) return "🥱 有点累";
    return "🥺 求摸摸";
  })();
  return (
    <motion.div
      className="pointer-events-auto absolute right-full top-0 z-[60] mr-2 w-64 rounded-xl border border-ink-700 bg-ink-900/95 p-3 text-xs text-ink-200 shadow-2xl backdrop-blur-md"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* 状态条 */}
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-ink-100">{moodLabel}</span>
        <motion.button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          aria-label="关闭桌宠设置"
          title="关闭"
          whileHover={hoverLift}
          whileTap={tapPress}
        >
          <X className="h-3.5 w-3.5" />
        </motion.button>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="rounded bg-ink-800/60 p-1.5">
          <div className="text-rose-300">{petCount}</div>
          <div className="text-ink-500">抚摸</div>
        </div>
        <div className="rounded bg-ink-800/60 p-1.5">
          <div className="text-accent-300">{Math.round(mood)}</div>
          <div className="text-ink-500">心情</div>
        </div>
        <div className="rounded bg-ink-800/60 p-1.5">
          <div className="text-emerald-300">{days}</div>
          <div className="text-ink-500">陪伴 · 天</div>
        </div>
      </div>

      {festival && (
        <div className="mb-2 rounded-lg bg-rose-500/10 px-2 py-1 text-center text-[11px] text-rose-200 ring-1 ring-rose-400/30">
          {FESTIVAL_LABEL[festival]} · 特别装扮中
        </div>
      )}

      {/* 番茄钟 */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-ink-400">🍅 番茄钟</span>
          <span className="text-ink-500">已完成 {pomodoroDoneCount}</span>
        </div>
        <motion.button
          type="button"
          onClick={onTogglePomodoro}
          className={`w-full rounded-md py-1.5 text-[11px] font-medium ring-1 ${
            pomodoroMode === "idle"
              ? "bg-accent-500/20 text-accent-200 ring-accent-400/30 hover:bg-accent-500/30"
              : "bg-rose-500/20 text-rose-200 ring-rose-400/30 hover:bg-rose-500/30"
          }`}
          whileHover={hoverLift}
          whileTap={tapPress}
        >
          {pomodoroMode === "idle"
            ? "▶ 开始 25/5"
            : pomodoroMode === "work"
              ? "■ 停止专注"
              : "■ 停止休息"}
        </motion.button>
      </div>

      {/* 聊天入口 */}
      <motion.button
        type="button"
        onClick={onChat}
        className="mb-2 w-full rounded-md bg-sky-500/15 py-1.5 text-[11px] text-sky-200 ring-1 ring-sky-400/30 hover:bg-sky-500/25"
        whileHover={hoverLift}
        whileTap={tapPress}
      >
        💬 找伙伴聊天
      </motion.button>

      <div className="mb-2">
        <label className="mb-1 flex justify-between text-ink-400" htmlFor="companion-opacity">
          <span>透明度</span>
          <span>{Math.round(opacity * 100)}%</span>
        </label>
        <input
          id="companion-opacity"
          type="range"
          min={40}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={(e) => onSetOpacity(Number(e.target.value) / 100)}
          className="w-full accent-accent-400"
        />
      </div>

      <label className="mb-2 flex cursor-pointer items-center gap-2" htmlFor="companion-particles-enabled">
        <input
          id="companion-particles-enabled"
          type="checkbox"
          checked={particlesEnabled}
          onChange={(e) => onSetParticles(e.target.checked)}
          className="accent-accent-400"
        />
        <span className="text-ink-300">✨ 环境粒子</span>
      </label>

      <motion.button
        type="button"
        onClick={onRename}
        className="mb-2 w-full rounded-md bg-ink-700/60 py-1.5 text-[11px] text-ink-200 hover:bg-ink-700"
        whileHover={hoverLift}
        whileTap={tapPress}
      >
        📛 起名 / 设生日
      </motion.button>

      {rainbowUnlocked && (
        <div className="mb-2 rounded bg-gradient-to-r from-rose-500/10 via-accent-500/10 to-violet-500/10 p-1.5 text-center text-[10px] text-accent-200 ring-1 ring-accent-400/30">
          🌈 已解锁彩虹皮肤
        </div>
      )}

      <motion.button
        type="button"
        onClick={onHide}
        className="w-full rounded-md bg-rose-500/20 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/30"
        whileHover={hoverLift}
        whileTap={tapPress}
      >
        隐藏桌宠
      </motion.button>
    </motion.div>
  );
}

/* ============================================================
 * 子组件：起名对话框
 * ============================================================ */

function RenameDialog({
  open,
  currentName,
  defaultName,
  currentBirthday,
  onSave,
  onCancel,
}: {
  open: boolean;
  currentName: string;
  defaultName: string;
  currentBirthday: string | null;
  onSave: (name: string, birthday: string | null) => void;
  onCancel: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const [name, setLocalName] = useState(currentName);
  const [birthday, setLocalBirthday] = useState(currentBirthday ?? "");
  const titleId = "companion-rename-title";
  const birthdayInvalid =
    birthday.length > 0 && (birthday.length !== 5 || !/^\d{2}-\d{2}$/.test(birthday));

  useEffect(() => {
    if (!open) return;
    setLocalName(currentName);
    setLocalBirthday(currentBirthday ?? "");
  }, [open, currentName, currentBirthday]);

  return (
    <AnimatedDialog
      open={open}
      onClose={onCancel}
      labelledBy={titleId}
      zClassName="z-[10000]"
      overlayClassName="pointer-events-auto flex items-center justify-center p-4"
      panelClassName="relative z-10 w-full max-w-sm rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl"
    >
      <motion.div
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        <h2 id={titleId} className="mb-1 text-base font-semibold text-ink-100">
          📛 给伙伴起个名字
        </h2>
        <p className="mb-4 text-xs text-ink-400">
          名字会出现在对话框和聊天里。最多 12 字。
        </p>
        <label className="mb-3 block" htmlFor="companion-name">
          <div className="mb-1 text-[11px] text-ink-400">名字</div>
          <input
            id="companion-name"
            type="text"
            value={name}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder={defaultName}
            maxLength={12}
            className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-400/40 focus:outline-none"
          />
        </label>
        <label className="mb-4 block" htmlFor="companion-birthday">
          <div className="mb-1 text-[11px] text-ink-400">
            🎂 你的生日（MM-DD，可留空）
          </div>
          <input
            id="companion-birthday"
            type="text"
            value={birthday}
            onChange={(e) => setLocalBirthday(e.target.value)}
            placeholder="例如 09-12"
            maxLength={5}
            aria-invalid={birthdayInvalid}
            className={`w-full rounded-md border bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none ${
              birthdayInvalid
                ? "border-rose-500/60 focus:border-rose-400/70"
                : "border-ink-700 focus:border-accent-400/40"
            }`}
          />
          <div className="mt-1 text-[10px] text-ink-500">
            生日当天桌宠会戴尖帽 + 蛋糕
          </div>
          {birthdayInvalid && (
            <motion.div
              role="alert"
              className="mt-1 text-[10px] text-rose-300"
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
            >
              请按 MM-DD 格式填写，或留空。
            </motion.div>
          )}
        </label>
        <div className="flex justify-end gap-2">
          <motion.button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
            whileHover={hoverLift}
            whileTap={tapPress}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            disabled={birthdayInvalid}
            onClick={() => {
              const validBirthday =
                birthday.length === 5 && /^\d{2}-\d{2}$/.test(birthday)
                  ? birthday
                  : null;
              onSave(name.trim() || defaultName, validBirthday);
            }}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:bg-ink-700 disabled:text-ink-400"
            whileHover={birthdayInvalid ? undefined : hoverLift}
            whileTap={birthdayInvalid ? undefined : tapPress}
          >
            保存
          </motion.button>
        </div>
      </motion.div>
    </AnimatedDialog>
  );
}
