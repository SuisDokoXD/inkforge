import { randomUUID } from "crypto";
import {
  ACHIEVEMENT_CATALOG,
  type AchievementId,
  type AchievementRarity,
  type AchievementStatsResponse,
  type AchievementUnlockedRecord,
} from "@inkforge/shared";
import {
  countAchievements,
  insertAchievement,
  isAchievementUnlocked,
  listAchievements as repoListAchievements,
  listChapters,
  listNovelCharacters,
  listWorldEntries,
  todayKey as formatDailyLogDate,
} from "@inkforge/storage";
import { getAppContext } from "./app-state";
import { logger } from "./logger";

type AchievementUnlockPublisher = (
  projectId: string,
  records: AchievementUnlockedRecord[],
) => void;

let achievementUnlockPublisher: AchievementUnlockPublisher | null = null;

export function setAchievementUnlockPublisher(
  publisher: AchievementUnlockPublisher | null,
): void {
  achievementUnlockPublisher = publisher;
}

function publishAchievementUnlocks(
  projectId: string,
  records: AchievementUnlockedRecord[],
): void {
  if (records.length === 0 || !achievementUnlockPublisher) return;
  try {
    achievementUnlockPublisher(projectId, records);
  } catch (error) {
    logger.warn("achievement unlock publish failed", error);
  }
}

/** 触发条件来源（可与已有事件挂钩；目前手动 + 定期 check） */
export type AchievementTrigger =
  | "chapter-update"
  | "chapter-create"
  | "character-create"
  | "character-update"
  | "world-create"
  | "world-update"
  | "auto-writer-done"
  | "letter-generate"
  | "snapshot-create"
  | "review-done"
  | "manual";

interface ProjectStats {
  totalWords: number;
  totalChapters: number;
  totalCharacters: number;
  totalWorldEntries: number;
  autoWriterRuns: number;
  snapshotsManual: number;
  letters: number;
  reviews: number;
  streakDays: number;
  longestStreak: number;
  todayWords: number;
  hasShortChapter: boolean;
  hasLongChapter: boolean;
  hasNamedChapter: boolean;
  hasRichCharacter: boolean;
  hasDetailedWorldEntry: boolean;
}

function gatherStats(projectId: string): ProjectStats {
  const ctx = getAppContext();
  const today = new Date();
  const fmtDate = (d: Date): string => formatDailyLogDate(d);
  const chapters = listChapters(ctx.db, projectId);
  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0);
  const totalChapters = chapters.length;
  const totalCharactersList = listNovelCharacters(ctx.db, projectId);
  const worldEntries = listWorldEntries(ctx.db, { projectId });
  const totalCharacters = totalCharactersList.length;
  const totalWorldEntries = worldEntries.length;
  const hasShortChapter = chapters.some((c) => (c.wordCount ?? 0) > 0 && (c.wordCount ?? 0) <= 500);
  const hasLongChapter = chapters.some((c) => (c.wordCount ?? 0) >= 2_000);
  const hasNamedChapter = chapters.some((c) => c.title.trim().length >= 8);
  const hasRichCharacter = totalCharactersList.some(
    (c) => (c.persona ?? "").trim().length + c.backstory.trim().length >= 120,
  );
  const hasDetailedWorldEntry = worldEntries.some((e) => e.content.trim().length >= 200);
  // count auto-writer-runs / snapshots / letters / reviews via raw SQL fallback
  const autoWriterRuns = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM auto_writer_runs WHERE project_id = ? AND status = 'completed'`,
      )
      .get(projectId) as { n: number }
  ).n;
  const snapshotsManual = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM chapter_snapshots WHERE project_id = ? AND kind = 'manual'`,
      )
      .get(projectId) as { n: number }
  ).n;
  const letters = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM character_letters WHERE project_id = ?`,
      )
      .get(projectId) as { n: number }
  ).n;
  const reviews = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM review_reports WHERE project_id = ? AND status = 'completed'`,
      )
      .get(projectId) as { n: number }
  ).n;

  // streak: 从 daily_logs 取最近 60 天，计算连续天数
  const dailyRows = ctx.db
    .prepare(
      `SELECT date FROM daily_logs
       WHERE project_id = ? AND words_added > 0
       ORDER BY date DESC LIMIT 90`,
    )
    .all(projectId) as { date: string }[];
  const todayKey = fmtDate(today);
  const todayWords = (
    ctx.db
      .prepare(
        `SELECT words_added AS n FROM daily_logs WHERE project_id = ? AND date = ?`,
      )
      .get(projectId, todayKey) as { n: number } | undefined
  )?.n ?? 0;
  const dates = new Set(dailyRows.map((r) => r.date));
  let streakDays = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dates.has(fmtDate(d))) streakDays++;
    else break;
  }
  // 最长连续：扫描已记录的日期序列
  let longestStreak = 0;
  let cur = 0;
  let prev: Date | null = null;
  const sorted = Array.from(dates).sort();
  for (const ds of sorted) {
    const d = new Date(`${ds}T00:00:00`);
    if (prev) {
      const diff = (d.getTime() - prev.getTime()) / (24 * 3600 * 1000);
      if (Math.abs(diff - 1) < 0.5) cur++;
      else cur = 1;
    } else {
      cur = 1;
    }
    longestStreak = Math.max(longestStreak, cur);
    prev = d;
  }

  return {
    totalWords,
    totalChapters,
    totalCharacters,
    totalWorldEntries,
    autoWriterRuns,
    snapshotsManual,
    letters,
    reviews,
    streakDays,
    longestStreak,
    todayWords,
    hasShortChapter,
    hasLongChapter,
    hasNamedChapter,
    hasRichCharacter,
    hasDetailedWorldEntry,
  };
}

/** 把数值规则浓缩在一个表里方便维护与单测 */
const RULES: Record<
  AchievementId,
  (stats: ProjectStats, ctx: { hour: number; weekend: boolean }) => boolean
> = {
  first_word: (s) => s.totalWords >= 1,
  words_1k: (s) => s.totalWords >= 1_000,
  words_5k: (s) => s.totalWords >= 5_000,
  words_10k: (s) => s.totalWords >= 10_000,
  words_50k: (s) => s.totalWords >= 50_000,
  words_100k: (s) => s.totalWords >= 100_000,
  words_300k: (s) => s.totalWords >= 300_000,
  first_chapter: (s) => s.totalChapters >= 1,
  chapters_5: (s) => s.totalChapters >= 5,
  chapters_20: (s) => s.totalChapters >= 20,
  chapters_50: (s) => s.totalChapters >= 50,
  streak_3: (s) => s.streakDays >= 3,
  streak_7: (s) => s.streakDays >= 7,
  streak_30: (s) => s.streakDays >= 30,
  night_owl: (s, c) => s.totalWords >= 1 && c.hour >= 0 && c.hour < 3,
  early_bird: (s, c) => s.totalWords >= 1 && c.hour >= 5 && c.hour < 7,
  weekend_warrior: (s, c) =>
    c.weekend && s.streakDays >= 1 && s.todayWords >= 1_000,
  first_character: (s) => s.totalCharacters >= 1,
  characters_5: (s) => s.totalCharacters >= 5,
  characters_15: (s) => s.totalCharacters >= 15,
  character_breathes: (s) => s.hasRichCharacter,
  first_world_entry: (s) => s.totalWorldEntries >= 1,
  worldbuilder: (s) => s.totalWorldEntries >= 5,
  lore_keeper: (s) => s.hasDetailedWorldEntry,
  first_auto_writer_run: (s) => s.autoWriterRuns >= 1,
  auto_writer_3: (s) => s.autoWriterRuns >= 3,
  first_letter_received: (s) => s.letters >= 1,
  letters_pen_pal: (s) => s.letters >= 5,
  first_review: (s) => s.reviews >= 1,
  backup_charm: (s) => s.snapshotsManual >= 1,
  snapshot_keeper: (s) => s.snapshotsManual >= 10,
  named_chapter: (s) => s.hasNamedChapter,
  short_blade: (s) => s.hasShortChapter,
  long_breath: (s) => s.hasLongChapter,
  // rewrite_master 由 auto-writer 引擎单独触发，rules 表里返回 false
  rewrite_master: () => false,
};

/**
 * 检查所有规则，新解锁项写入 DB 并返回。
 * 幂等：已解锁的不会重复入库。
 */
export function checkAchievements(
  projectId: string,
  trigger: AchievementTrigger = "manual",
): AchievementUnlockedRecord[] {
  const ctx = getAppContext();
  const stats = gatherStats(projectId);
  const now = new Date();
  const cond = {
    hour: now.getHours(),
    weekend: now.getDay() === 0 || now.getDay() === 6,
  };
  const newlyUnlocked: AchievementUnlockedRecord[] = [];
  for (const def of ACHIEVEMENT_CATALOG) {
    try {
      const rule = RULES[def.id];
      if (!rule) continue;
      if (!rule(stats, cond)) continue;
      if (isAchievementUnlocked(ctx.db, projectId, def.id)) continue;
      const rec = insertAchievement(ctx.db, {
        id: randomUUID(),
        projectId,
        achievementId: def.id,
        metadata: { trigger, stats },
      });
      if (rec) newlyUnlocked.push(rec);
    } catch (error) {
      logger.warn(`achievement ${def.id} check failed`, error);
    }
  }
  return newlyUnlocked;
}

export function checkAchievementsAndNotify(
  projectId: string,
  trigger: AchievementTrigger = "manual",
): AchievementUnlockedRecord[] {
  const newlyUnlocked = checkAchievements(projectId, trigger);
  publishAchievementUnlocks(projectId, newlyUnlocked);
  return newlyUnlocked;
}

/** 直接解锁单个成就（用于 auto-writer 引擎 rewrite_master 等特殊触发） */
export function unlockAchievement(
  projectId: string,
  achievementId: AchievementId,
  metadata: Record<string, unknown> = {},
): AchievementUnlockedRecord | null {
  const ctx = getAppContext();
  if (isAchievementUnlocked(ctx.db, projectId, achievementId)) return null;
  return insertAchievement(ctx.db, {
    id: randomUUID(),
    projectId,
    achievementId,
    metadata,
  });
}

export function unlockAchievementAndNotify(
  projectId: string,
  achievementId: AchievementId,
  metadata: Record<string, unknown> = {},
): AchievementUnlockedRecord | null {
  const rec = unlockAchievement(projectId, achievementId, metadata);
  if (rec) publishAchievementUnlocks(projectId, [rec]);
  return rec;
}

export function listAchievements(
  projectId: string,
): AchievementUnlockedRecord[] {
  const ctx = getAppContext();
  return repoListAchievements(ctx.db, projectId);
}

export function getAchievementStats(projectId: string): AchievementStatsResponse {
  const ctx = getAppContext();
  const totalUnlocked = countAchievements(ctx.db, projectId);
  const totalCatalog = ACHIEVEMENT_CATALOG.length;
  const unlocked = repoListAchievements(ctx.db, projectId);
  const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
  const byRarity: Record<AchievementRarity, number> = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  for (const def of ACHIEVEMENT_CATALOG) {
    if (unlockedIds.has(def.id)) byRarity[def.rarity]++;
  }
  const stats = gatherStats(projectId);
  // letters/reviews 留给 stats 接口隐藏（前端不需要）
  return {
    totalUnlocked,
    totalCatalog,
    byRarity,
    stats: {
      totalWords: stats.totalWords,
      totalChapters: stats.totalChapters,
      totalCharacters: stats.totalCharacters,
      totalWorldEntries: stats.totalWorldEntries,
      autoWriterRuns: stats.autoWriterRuns,
      snapshotsManual: stats.snapshotsManual,
      streakDays: stats.streakDays,
      longestStreak: stats.longestStreak,
    },
  };
}
