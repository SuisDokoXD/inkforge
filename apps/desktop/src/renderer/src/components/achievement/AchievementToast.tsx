import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import {
  findAchievement,
  rarityColor,
  type AchievementRarity,
  type AchievementUnlockedRecord,
} from "@inkforge/shared";
import { achievementApi } from "../../lib/api";
import {
  DUR,
  EASE_STANDARD,
  fadeOnly,
  hoverLift,
  SPRING_GENTLE,
  SPRING_SNAPPY,
  tapPress,
} from "../../lib/motion-tokens";

interface ToastItem {
  rec: AchievementUnlockedRecord;
  expiresAt: number;
}

const VISIBLE_MS = 6000;

/**
 * 全局成就解锁通知。挂在 App.tsx 顶层。
 * 监听 achievement:unlocked 事件，把弹窗串成右下角向上滑入的卡片队列。
 */
export function AchievementToast(): JSX.Element | null {
  const [items, setItems] = useState<ToastItem[]>([]);
  const queryClient = useQueryClient();
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeItem = useCallback((id: string): void => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.rec.id !== id));
  }, []);

  useEffect(() => {
    const off = achievementApi.onUnlocked((evt) => {
      const expiresAt = Date.now() + VISIBLE_MS;
      setItems((prev) => [
        ...prev.filter((item) => item.rec.id !== evt.achievement.id),
        { rec: evt.achievement, expiresAt },
      ]);
      const previousTimer = timersRef.current.get(evt.achievement.id);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.rec.id !== evt.achievement.id));
        timersRef.current.delete(evt.achievement.id);
      }, VISIBLE_MS);
      timersRef.current.set(evt.achievement.id, timer);
      void queryClient.invalidateQueries({
        queryKey: ["achievement-list", evt.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["achievement-stats", evt.projectId],
      });
    });
    return off;
  }, [queryClient]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <ToastCard
            key={it.rec.id}
            item={it}
            onClose={() => removeItem(it.rec.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}): JSX.Element {
  const { rec, expiresAt } = item;
  const reduceMotion = useReducedMotion() === true;
  const def = findAchievement(rec.achievementId);
  if (!def) return <></>;
  const color = rarityColor(def.rarity);
  const remainingSeconds = Math.max(0, (expiresAt - Date.now()) / 1000);
  const cardMotion = reduceMotion
    ? fadeOnly
    : {
        initial: { opacity: 0, x: 48, scale: 0.95 },
        animate: { opacity: 1, x: 0, scale: 1, transition: SPRING_GENTLE },
        exit: {
          opacity: 0,
          x: 32,
          scale: 0.96,
          transition: { duration: DUR.fast, ease: EASE_STANDARD },
        },
      };
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  return (
    <motion.div
      role="status"
      layout
      variants={cardMotion}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`pointer-events-auto relative flex w-72 items-start gap-3 overflow-hidden rounded-lg border p-3 pb-3.5 shadow-2xl ring-1 backdrop-blur ${color.bg} ${color.ring}`}
    >
      <span className="text-2xl">{def.icon}</span>
      <div className="flex-1">
        <div className={`text-[10px] uppercase tracking-wider ${color.text}`}>
          新徽章到手 · {rarityLabel(def.rarity)}
        </div>
        <div className="text-sm font-semibold text-ink-100">{def.title}</div>
        <div className="text-[11px] text-ink-300">{def.description}</div>
      </div>
      <motion.button
        type="button"
        onClick={onClose}
        className="absolute right-1 top-1 rounded p-1 text-ink-400 hover:bg-ink-900/30 hover:text-ink-100"
        aria-label="关闭成就通知"
        {...buttonMotion}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </motion.button>
      <motion.div
        key={expiresAt}
        aria-hidden
        className={`absolute inset-x-0 bottom-0 h-0.5 ${color.text}`}
        style={{ backgroundColor: "currentColor" }}
        initial={{ width: "100%" }}
        animate={{ width: reduceMotion ? "100%" : "0%" }}
        transition={{ duration: remainingSeconds, ease: "linear" }}
      />
    </motion.div>
  );
}

function rarityLabel(rarity: AchievementRarity): string {
  switch (rarity) {
    case "common":
      return "普通";
    case "rare":
      return "稀有";
    case "epic":
      return "史诗";
    case "legendary":
      return "传说";
  }
}
