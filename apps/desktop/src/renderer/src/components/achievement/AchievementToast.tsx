import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  findAchievement,
  rarityColor,
  type AchievementRarity,
  type AchievementUnlockedRecord,
} from "@inkforge/shared";
import { achievementApi } from "../../lib/api";
import { SPRING_GENTLE } from "../../lib/motion-tokens";

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

  useEffect(() => {
    const off = achievementApi.onUnlocked((evt) => {
      setItems((prev) => [
        ...prev,
        { rec: evt.achievement, expiresAt: Date.now() + VISIBLE_MS },
      ]);
      void queryClient.invalidateQueries({
        queryKey: ["achievement-list", evt.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["achievement-stats", evt.projectId],
      });
    });
    return off;
  }, [queryClient]);

  // 每秒清理过期项
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setItems((prev) => prev.filter((it) => it.expiresAt > now));
    }, 500);
    return () => clearInterval(id);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {items.map((it) => (
          <ToastCard
            key={it.rec.id}
            rec={it.rec}
            onClose={() =>
              setItems((prev) => prev.filter((p) => p.rec.id !== it.rec.id))
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  rec,
  onClose,
}: {
  rec: AchievementUnlockedRecord;
  onClose: () => void;
}): JSX.Element {
  const def = findAchievement(rec.achievementId);
  if (!def) return <></>;
  const color = rarityColor(def.rarity);
  return (
    <motion.div
      role="status"
      // 从右侧滑入、退场时滑出；spring 带轻微过冲，呼应"解锁"的庆祝感。
      layout
      initial={{ opacity: 0, x: 48, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.95 }}
      transition={SPRING_GENTLE}
      className={`pointer-events-auto relative flex w-72 items-start gap-3 rounded-xl border p-3 shadow-2xl ring-1 backdrop-blur ${color.bg} ${color.ring}`}
    >
      <span className="text-2xl">{def.icon}</span>
      <div className="flex-1">
        <div className={`text-[10px] uppercase tracking-wider ${color.text}`}>
          新徽章到手 · {rarityLabel(def.rarity)}
        </div>
        <div className="text-sm font-semibold text-ink-100">{def.title}</div>
        <div className="text-[11px] text-ink-300">{def.description}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-1 top-1 text-ink-400 hover:text-ink-100"
        aria-label="关闭"
      >
        ✕
      </button>
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
