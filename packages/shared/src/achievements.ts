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
    title: "墨点初燃",
    icon: "✍",
    description: "第一个字落在纸上",
    rarity: "common",
    hint: "随便写一个字",
    category: "milestone",
  },
  {
    id: "words_1k",
    title: "千字破雾",
    icon: "📜",
    description: "故事开始有了轮廓",
    rarity: "common",
    hint: "累计写满 1,000 字",
    category: "milestone",
  },
  {
    id: "words_5k",
    title: "五千入局",
    icon: "📚",
    description: "人物和冲突开始动起来",
    rarity: "common",
    hint: "累计写满 5,000 字",
    category: "milestone",
  },
  {
    id: "words_10k",
    title: "万字开门",
    icon: "🥉",
    description: "跨过第一道长篇门槛",
    rarity: "rare",
    hint: "累计写满 1 万字",
    category: "milestone",
  },
  {
    id: "words_50k",
    title: "五万成卷",
    icon: "🥈",
    description: "已经能翻出一卷厚度",
    rarity: "rare",
    hint: "累计写满 5 万字",
    category: "milestone",
  },
  {
    id: "words_100k",
    title: "十万长风",
    icon: "🥇",
    description: "故事吹过十万字山口",
    rarity: "epic",
    hint: "累计写满 10 万字",
    category: "milestone",
  },
  {
    id: "words_300k",
    title: "长篇封印",
    icon: "💎",
    description: "一本长篇的封印被打开",
    rarity: "legendary",
    hint: "累计写满 30 万字（一本书的长度）",
    category: "milestone",
  },

  // ---- 章节 ----
  {
    id: "first_chapter",
    title: "第一扇门",
    icon: "📖",
    description: "第一章把读者请了进来",
    rarity: "common",
    hint: "创建第一个章节",
    category: "milestone",
  },
  {
    id: "chapters_5",
    title: "五章成势",
    icon: "📔",
    description: "故事开始有稳定节奏",
    rarity: "common",
    hint: "创建 5 个章节",
    category: "milestone",
  },
  {
    id: "chapters_20",
    title: "二十幕开台",
    icon: "📕",
    description: "剧情已经搭起舞台",
    rarity: "rare",
    hint: "创建 20 个章节",
    category: "milestone",
  },
  {
    id: "chapters_50",
    title: "卷帙成山",
    icon: "📗",
    description: "章节多到能堆成一座小山",
    rarity: "epic",
    hint: "创建 50 个章节",
    category: "milestone",
  },
  {
    id: "named_chapter",
    title: "标题会说话",
    icon: "🏷️",
    description: "章节标题开始有戏",
    rarity: "common",
    hint: "写一个 8 字以上的章节标题",
    category: "craft",
  },
  {
    id: "short_blade",
    title: "短刀一闪",
    icon: "🗡️",
    description: "一章很短，也能留下锋芒",
    rarity: "rare",
    hint: "写出一章 1-500 字的短章",
    category: "craft",
  },
  {
    id: "long_breath",
    title: "一口气两千",
    icon: "🌬️",
    description: "单章写到 2,000 字以上",
    rarity: "rare",
    hint: "任意章节写满 2,000 字",
    category: "craft",
  },

  // ---- 节奏（连续打卡 / 时段） ----
  {
    id: "streak_3",
    title: "三日不凉",
    icon: "🔥",
    description: "故事的火连续烧了三天",
    rarity: "common",
    hint: "连续 3 天写作",
    category: "rhythm",
  },
  {
    id: "streak_7",
    title: "七日热稿",
    icon: "🔥🔥",
    description: "一周都没有让稿子冷掉",
    rarity: "rare",
    hint: "连续 7 天写作",
    category: "rhythm",
  },
  {
    id: "streak_30",
    title: "月光长跑",
    icon: "🔥🔥🔥",
    description: "连续一个月守住故事",
    rarity: "legendary",
    hint: "连续 30 天写作",
    category: "rhythm",
  },
  {
    id: "night_owl",
    title: "零点开炉",
    icon: "🦉",
    description: "午夜后还在给故事添火",
    rarity: "rare",
    hint: "凌晨 0–3 点写作",
    category: "rhythm",
  },
  {
    id: "early_bird",
    title: "晨光起笔",
    icon: "🌅",
    description: "天刚亮就开始推进章节",
    rarity: "rare",
    hint: "清晨 5–7 点写作",
    category: "rhythm",
  },
  {
    id: "weekend_warrior",
    title: "周末赶稿",
    icon: "⚔️",
    description: "周末写满 1,000 字",
    rarity: "rare",
    hint: "周末当天写满 1,000 字",
    category: "rhythm",
  },

  // ---- 角色 / 世界观 ----
  {
    id: "first_character",
    title: "有人登场",
    icon: "👤",
    description: "第一个人物拥有了档案",
    rarity: "common",
    hint: "创建第一个人物档案",
    category: "character",
  },
  {
    id: "characters_5",
    title: "五人入镜",
    icon: "👥",
    description: "镜头里站进了五个人",
    rarity: "common",
    hint: "创建 5 个人物档案",
    category: "character",
  },
  {
    id: "characters_15",
    title: "群像开席",
    icon: "🎭",
    description: "十五个人物把舞台坐满",
    rarity: "rare",
    hint: "创建 15 个人物档案",
    category: "character",
  },
  {
    id: "character_breathes",
    title: "人物会呼吸",
    icon: "💬",
    description: "有人物档案写得足够立体",
    rarity: "rare",
    hint: "写一张 120 字以上的人物档案",
    category: "character",
  },
  {
    id: "first_world_entry",
    title: "设定发芽",
    icon: "🌱",
    description: "世界观长出第一片叶子",
    rarity: "common",
    hint: "创建第一条世界观条目",
    category: "world",
  },
  {
    id: "worldbuilder",
    title: "地图铺开",
    icon: "🌍",
    description: "五条设定把世界撑开",
    rarity: "rare",
    hint: "创建 5 条世界观条目",
    category: "world",
  },
  {
    id: "lore_keeper",
    title: "设定有根",
    icon: "🧭",
    description: "一条设定写到能被剧情引用",
    rarity: "rare",
    hint: "写一条 200 字以上的世界观条目",
    category: "world",
  },

  // ---- AI / 工具 ----
  {
    id: "first_auto_writer_run",
    title: "借火续稿",
    icon: "🤖",
    description: "第一次让模型帮你推进章节",
    rarity: "common",
    hint: "完成第一次续写精修运行",
    category: "ai",
  },
  {
    id: "auto_writer_3",
    title: "三次借火",
    icon: "🤖✨",
    description: "和模型协作完成三次写作",
    rarity: "rare",
    hint: "完成 3 次续写精修运行",
    category: "ai",
  },
  {
    id: "first_letter_received",
    title: "角色来信",
    icon: "📩",
    description: "角色第一次从故事里写信给你",
    rarity: "common",
    hint: "生成第一封角色来信",
    category: "ai",
  },
  {
    id: "letters_pen_pal",
    title: "信箱热闹",
    icon: "📫",
    description: "角色们已经寄来五封信",
    rarity: "rare",
    hint: "累计 5 封角色来信",
    category: "ai",
  },
  {
    id: "first_review",
    title: "请人挑刺",
    icon: "📊",
    description: "第一次请模型认真审稿",
    rarity: "common",
    hint: "运行一次审查",
    category: "craft",
  },
  {
    id: "backup_charm",
    title: "护身存档",
    icon: "🧿",
    description: "第一次手动留下章节备份",
    rarity: "common",
    hint: "创建 1 个手动章节快照",
    category: "craft",
  },
  {
    id: "snapshot_keeper",
    title: "时间保险箱",
    icon: "📸",
    description: "十次把灵感安全收好",
    rarity: "rare",
    hint: "手动创建 10 个章节快照",
    category: "craft",
  },
  {
    id: "rewrite_master",
    title: "越改越硬",
    icon: "🛠️",
    description: "一段文字被反复锤炼仍完成",
    rarity: "epic",
    hint: "续写精修中同一段触发 ≥3 次重写后仍完成",
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
