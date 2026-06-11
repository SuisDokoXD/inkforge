import type { AchievementId, AchievementRarity } from "./domain";

export interface AchievementDefinition {
  id: AchievementId;
  /** 中文标题（≤ 8 字理想）。 */
  title: string;
  /** 一行短描述。 */
  description: string;
  /** Emoji 徽章 icon。 */
  icon: string;
  /** 稀有度，影响渲染颜色与展示顺序。 */
  rarity: AchievementRarity;
  /**
   * 触发条件的人类可读说明，用于 hall 页"未解锁"的提示。
   * 不建议把数字作为字符串硬编码，但本目录保持小巧，简洁优先。
   */
  hint: string;
  /** 分类，用于 hall 页分组展示。 */
  category:
    | "milestone"
    | "rhythm"
    | "character"
    | "world"
    | "ai"
    | "craft";
}

/**
 * 内置成就目录（25+）。
 * service 检查是按 ID 写入，前端按本目录渲染。
 */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  // ---- 字数 ----
  {
    id: "first_word",
    title: "下笔",
    icon: "✍",
    description: "写下了第一个字",
    rarity: "common",
    hint: "随便写一个字",
    category: "milestone",
  },
  {
    id: "words_1k",
    title: "千字小成",
    icon: "📜",
    description: "全书累计 1,000 字",
    rarity: "common",
    hint: "累计写满 1,000 字",
    category: "milestone",
  },
  {
    id: "words_5k",
    title: "五千江湖",
    icon: "📚",
    description: "全书累计 5,000 字",
    rarity: "common",
    hint: "累计写满 5,000 字",
    category: "milestone",
  },
  {
    id: "words_10k",
    title: "万字青铜",
    icon: "🥉",
    description: "全书累计 10,000 字",
    rarity: "rare",
    hint: "累计写满 1 万字",
    category: "milestone",
  },
  {
    id: "words_50k",
    title: "五万白银",
    icon: "🥈",
    description: "全书累计 50,000 字",
    rarity: "rare",
    hint: "累计写满 5 万字",
    category: "milestone",
  },
  {
    id: "words_100k",
    title: "十万黄金",
    icon: "🥇",
    description: "全书累计 100,000 字",
    rarity: "epic",
    hint: "累计写满 10 万字",
    category: "milestone",
  },
  {
    id: "words_300k",
    title: "三十万钻石",
    icon: "💎",
    description: "全书累计 300,000 字",
    rarity: "legendary",
    hint: "累计写满 30 万字（一本书的长度）",
    category: "milestone",
  },

  // ---- 章节 ----
  {
    id: "first_chapter",
    title: "起笔成章",
    icon: "📖",
    description: "第一章诞生",
    rarity: "common",
    hint: "创建第一个章节",
    category: "milestone",
  },
  {
    id: "chapters_5",
    title: "五章扎实",
    icon: "📔",
    description: "全书累计 5 个章节",
    rarity: "common",
    hint: "创建 5 个章节",
    category: "milestone",
  },
  {
    id: "chapters_20",
    title: "二十章节",
    icon: "📕",
    description: "全书累计 20 个章节",
    rarity: "rare",
    hint: "创建 20 个章节",
    category: "milestone",
  },
  {
    id: "chapters_50",
    title: "鸿篇巨制",
    icon: "📗",
    description: "全书累计 50 个章节",
    rarity: "epic",
    hint: "创建 50 个章节",
    category: "milestone",
  },

  // ---- 节奏（连续打卡 / 时段） ----
  {
    id: "streak_3",
    title: "三日连击",
    icon: "🔥",
    description: "连续 3 天有更新",
    rarity: "common",
    hint: "连续 3 天写作",
    category: "rhythm",
  },
  {
    id: "streak_7",
    title: "七日精进",
    icon: "🔥🔥",
    description: "连续 7 天有更新",
    rarity: "rare",
    hint: "连续 7 天写作",
    category: "rhythm",
  },
  {
    id: "streak_30",
    title: "月度坚守",
    icon: "🔥🔥🔥",
    description: "连续 30 天有更新",
    rarity: "legendary",
    hint: "连续 30 天写作",
    category: "rhythm",
  },
  {
    id: "night_owl",
    title: "夜行者",
    icon: "🦉",
    description: "0–3 点之间还在写作",
    rarity: "rare",
    hint: "凌晨 0–3 点写作",
    category: "rhythm",
  },
  {
    id: "early_bird",
    title: "破晓者",
    icon: "🌅",
    description: "5–7 点之间已开始写作",
    rarity: "rare",
    hint: "清晨 5–7 点写作",
    category: "rhythm",
  },
  {
    id: "weekend_warrior",
    title: "周末战士",
    icon: "⚔️",
    description: "周六或周日写满日目标",
    rarity: "rare",
    hint: "周末完成日字数目标",
    category: "rhythm",
  },

  // ---- 角色 / 世界观 ----
  {
    id: "first_character",
    title: "立人卡",
    icon: "👤",
    description: "创建了第一个人物",
    rarity: "common",
    hint: "创建第一个人物档案",
    category: "character",
  },
  {
    id: "characters_5",
    title: "群像初现",
    icon: "👥",
    description: "创建 5 个人物",
    rarity: "common",
    hint: "创建 5 个人物档案",
    category: "character",
  },
  {
    id: "characters_15",
    title: "众生相",
    icon: "🎭",
    description: "创建 15 个人物",
    rarity: "rare",
    hint: "创建 15 个人物档案",
    category: "character",
  },
  {
    id: "first_world_entry",
    title: "立世",
    icon: "🌱",
    description: "第一条世界观条目",
    rarity: "common",
    hint: "创建第一条世界观条目",
    category: "world",
  },
  {
    id: "worldbuilder",
    title: "造物者",
    icon: "🌍",
    description: "5 条世界观条目",
    rarity: "rare",
    hint: "创建 5 条世界观条目",
    category: "world",
  },

  // ---- AI / 工具 ----
  {
    id: "first_auto_writer_run",
    title: "AI 初体验",
    icon: "🤖",
    description: "第一次跑完自动写作",
    rarity: "common",
    hint: "完成第一次自动写作运行",
    category: "ai",
  },
  {
    id: "auto_writer_3",
    title: "AI 老手",
    icon: "🤖✨",
    description: "完成 3 次自动写作运行",
    rarity: "rare",
    hint: "完成 3 次自动写作运行",
    category: "ai",
  },
  {
    id: "first_letter_received",
    title: "笔友",
    icon: "📩",
    description: "收到第一封角色来信",
    rarity: "common",
    hint: "生成第一封角色来信",
    category: "ai",
  },
  {
    id: "letters_pen_pal",
    title: "鸿雁不绝",
    icon: "📫",
    description: "累计收到 5 封角色来信",
    rarity: "rare",
    hint: "累计 5 封角色来信",
    category: "ai",
  },
  {
    id: "first_review",
    title: "请同行品鉴",
    icon: "📊",
    description: "完成第一次 AI 审查",
    rarity: "common",
    hint: "运行一次审查",
    category: "craft",
  },
  {
    id: "snapshot_keeper",
    title: "时光收藏家",
    icon: "📸",
    description: "创建 10 个手动快照",
    rarity: "rare",
    hint: "手动创建 10 个章节快照",
    category: "craft",
  },
  {
    id: "rewrite_master",
    title: "千锤百炼",
    icon: "🛠️",
    description: "单段被校阅重写 ≥3 次仍坚持完成",
    rarity: "epic",
    hint: "自动写作中同一段触发 ≥3 次重写后仍完成",
    category: "craft",
  },
];

export function findAchievement(
  id: AchievementId,
): AchievementDefinition | null {
  return ACHIEVEMENT_CATALOG.find((a) => a.id === id) ?? null;
}

export function rarityColor(rarity: AchievementRarity): {
  bg: string;
  text: string;
  ring: string;
} {
  switch (rarity) {
    case "common":
      return { bg: "bg-ink-700/60", text: "text-ink-200", ring: "ring-ink-600" };
    case "rare":
      return {
        bg: "bg-sky-500/10",
        text: "text-sky-300",
        ring: "ring-sky-500/40",
      };
    case "epic":
      return {
        bg: "bg-fuchsia-500/10",
        text: "text-fuchsia-300",
        ring: "ring-fuchsia-500/40",
      };
    case "legendary":
      return {
        bg: "bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-fuchsia-500/20",
        text: "text-amber-200",
        ring: "ring-amber-400/60",
      };
  }
}
