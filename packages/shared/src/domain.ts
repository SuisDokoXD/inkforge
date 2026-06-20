export type ProviderVendor = "anthropic" | "openai" | "gemini" | "openai-compat";

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  dailyGoal: number;
  lastOpened: string | null;
  // ----- v19: creative metadata for AI outline/chapter generation -----
  synopsis: string;
  genre: string;
  subGenre: string;
  tags: string[];
  masterOutline: string;
  preRefineMasterOutline: string | null;
  // ----- v20: per-book global worldview prose, injected into AutoWriter ----
  globalWorldview: string;
}

export interface ChapterRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  order: number;
  status: string;
  wordCount: number;
  filePath: string;
  /** ISO-8601 of last DB write. May be null on rows created before migration v13. */
  updatedAt: string | null;
}

export interface ProviderRecord {
  id: string;
  label: string;
  vendor: ProviderVendor;
  baseUrl: string;
  defaultModel: string;
  tags: string[];
}

export interface AIFeedbackRecord {
  id: string;
  projectId: string;
  chapterId: string;
  type: string;
  payload: Record<string, unknown>;
  trigger: string;
  createdAt: string;
  dismissed: boolean;
}

export interface OutlineCardRecord {
  id: string;
  projectId: string;
  chapterId: string | null;
  title: string;
  content: string;
  status: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyProgressRecord {
  date: string;
  projectId: string;
  wordsAdded: number;
  goal: number;
  goalHit: boolean;
}

export type AppSettingKey =
  | "theme"
  | "activeProviderId"
  | "analysisEnabled"
  | "analysisThreshold"
  | "uiLanguage"
  | "devModeEnabled"
  | "onboardingCompleted"
  | "sceneRoutingMode"
  | "editorFontSize"
  | "editorLineHeight"
  | "editorWidth"
  | "typewriterMode"
  | "autoIndent"
  | "spellcheck"
  | "focusMode";

export interface AppSettings {
  theme: "dark" | "light" | "paper";
  activeProviderId: string | null;
  analysisEnabled: boolean;
  analysisThreshold: number;
  uiLanguage: "zh" | "en" | "ja";
  devModeEnabled: boolean;
  onboardingCompleted: boolean;
  sceneRoutingMode: SceneRoutingMode;
  editorFontSize: number;
  editorLineHeight: number;
  editorWidth: "narrow" | "medium" | "wide";
  typewriterMode: boolean;
  autoIndent: boolean;
  spellcheck: boolean;
  focusMode: boolean;
  /** 玻璃质感效果（毛玻璃面板/弹窗/标题栏）。为 true 时启用，默认 false。 */
  glassEnabled: boolean;
}

// ===== Scene Bindings (ported from ainovel) =====
export type SceneRoutingMode = "basic" | "advanced";

export type SceneKeyBasic =
  | "outline_generation"
  | "main_generation"
  | "extract"
  | "summarize"
  | "inline";

export type SceneKeyAdvanced =
  | "analyze"
  | "quick"
  | "chat"
  | "skill"
  | "tavern"
  | "auto-writer"
  | "review"
  | "daily-summary"
  | "letter";

export type SceneKey = SceneKeyBasic | SceneKeyAdvanced;

export interface SceneBindingRecord {
  sceneKey: SceneKey;
  providerId: string | null;
  model: string | null;
  updatedAt: string;
}

export const SCENE_KEYS_BASIC: readonly SceneKeyBasic[] = [
  "outline_generation",
  "main_generation",
  "extract",
  "summarize",
  "inline",
] as const;

export const SCENE_KEYS_ADVANCED: readonly SceneKeyAdvanced[] = [
  "analyze",
  "quick",
  "chat",
  "skill",
  "tavern",
  "auto-writer",
  "review",
  "daily-summary",
  "letter",
] as const;

// ===== Sample Library (参考小说库, ported from ainovel) =====
export interface SampleLibRecord {
  id: string;
  projectId: string;
  title: string;
  author: string | null;
  notes: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SampleChunkRecord {
  id: string;
  libId: string;
  ordinal: number;
  chapterTitle: string | null;
  text: string;
}

// ===== World Relationships (graph, ported from ainovel) =====
export type WorldGraphEndpointKind = "character" | "world_entry";

export interface WorldRelationshipRecord {
  id: string;
  projectId: string;
  srcKind: WorldGraphEndpointKind;
  srcId: string;
  dstKind: WorldGraphEndpointKind;
  dstId: string;
  label: string | null;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export type SkillScope = "global" | "project" | "community";

export type SkillTriggerType =
  | "selection"
  | "every-n-chars"
  | "on-save"
  | "on-chapter-end"
  | "manual";

export type SkillOutputTarget =
  | "ai-feedback"
  | "replace-selection"
  | "insert-after-selection"
  | "append-chapter";

export interface SkillVariableDef {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface SkillTriggerDef {
  type: SkillTriggerType;
  enabled: boolean;
  everyNChars?: number;
  debounceMs?: number;
  cooldownMs?: number;
}

export interface SkillBinding {
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  summaryProviderId?: string;
  summaryModel?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  prompt: string;
  variables: SkillVariableDef[];
  triggers: SkillTriggerDef[];
  binding: SkillBinding;
  output: SkillOutputTarget;
  enabled: boolean;
  scope: SkillScope;
  createdAt: string;
  updatedAt: string;
}

export type TavernMode = "director" | "auto";

export type TavernRole = "director" | "character" | "summary";

export type SyncMode = "two-way" | "snapshot" | "detached";

export interface TavernCardRecord {
  id: string;
  name: string;
  persona: string;
  avatarPath: string | null;
  providerId: string;
  model: string;
  temperature: number;
  linkedNovelCharacterId: string | null;
  syncMode: SyncMode;
  createdAt: string;
  updatedAt: string;
}

export interface NovelCharacterRecord {
  id: string;
  projectId: string;
  name: string;
  persona: string | null;
  traits: Record<string, unknown>;
  backstory: string;
  relations: Array<{ otherId: string; label: string }>;
  linkedTavernCardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CharacterSyncField = "persona" | "backstory" | "traits";

export type CharacterSyncDirection =
  | "novel_to_card"
  | "card_to_novel"
  | "manual_merge";

export interface CharacterSyncLogRecord {
  id: string;
  novelCharId: string;
  tavernCardId: string | null;
  field: CharacterSyncField;
  oldValue: string;
  newValue: string;
  direction: CharacterSyncDirection;
  at: string;
}

export interface TavernSessionRecord {
  id: string;
  projectId: string;
  title: string;
  topic: string;
  mode: TavernMode;
  budgetTokens: number;
  summaryProviderId: string | null;
  summaryModel: string | null;
  lastK: number;
  createdAt: string;
}

export interface TavernMessageRecord {
  id: string;
  sessionId: string;
  characterId: string | null;
  role: TavernRole;
  content: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

export interface SkillRunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedInputTokens?: number;
}

export interface SkillPackV1 {
  format: "inkforge.skill-pack";
  version: "1.0.0";
  exportedAt: string;
  source: "inkforge-desktop";
  skills: SkillDefinition[];
}

export interface SkillImportReport {
  format: string;
  version: string;
  total: number;
  imported: number;
  replaced: number;
  skipped: number;
  errors: Array<{ skillId?: string; reason: string }>;
}

export interface SyncDiffRow {
  field: CharacterSyncField;
  novelValue: unknown;
  cardValue: unknown;
  winner: "novel" | "card" | null;
  conflict: boolean;
}

export interface TokenBudgetState {
  sessionId: string;
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  shouldWarn: boolean;
  warnAt: string | null;
}

export interface CompactResult {
  summaryMessageId: string;
  replacedMessageCount: number;
  usage: SkillRunUsage;
}

// ---------- M4 · World ----------

export type WorldEntryCategory = string;

// 世界观条目的注入位置（v22 起）。
//   before：拼到 user prompt 之前（默认，最常见用法 —— 让 LLM 先看到设定再读任务）
//   after：拼到 user prompt 之后（用于"补充背景"，影响轻于 before）
//   at_depth：保留接口，未来用于 chat-history 倒数第 N 条注入（SillyTavern AT_DEPTH 语义）
export type WorldEntryPosition = "before" | "after" | "at_depth";

export interface WorldEntryRecord {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string;
  aliases: string[];
  tags: string[];
  // ----- v22 · World Info 自动注入触发字段 -----
  // 额外关键词（除 title + aliases 之外）。activator 扫文本时把
  // [title, ...aliases, ...keys] 合并去重后作为触发集。
  keys: string[];
  // 注入位置，决定本条 entry 拼到 prompt 的哪一段。
  position: WorldEntryPosition;
  // 命中关键词后的注入概率（0-100），100 = 永远注入。
  probability: number;
  // ----- v25 · CCv3 兼容字段 -----
  secondaryKeys: string[];
  selectiveLogic: "and_any" | "not_all" | "not_any" | "and_all";
  caseSensitive: boolean;
  constant: boolean;             // 绕过关键词命中，永远激活（用于"必读设定"）
  extensions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------- v23 · 世界观卡牌（Worldview Cards） ----------

// 卡牌来源：
//   user     —— 用户从零创建
//   fused    —— 多张卡 LLM 融合产物（parentPackIds 记录祖先链）
//   imported —— 从外部 JSON / SillyTavern lorebook 导入
export type WorldPackOrigin = "user" | "fused" | "imported";

// 卡牌（跨项目的世界观预设）。
// 卡内 World Info 配置（scan_depth / token_budget / recursion）在卡牌级别共享，
// 一张卡内所有 entries 用同一组触发策略——符合"卡牌作为完整世界观单位"的直觉。
export interface WorldPackRecord {
  id: string;
  name: string;
  tagline: string;        // 一句话副标题（卡面用）
  description: string;    // 长描述（详情页用）
  coverPath: string | null;  // 相对工作区路径，如 ".world-packs/<id>.png"
  coverMime: string | null;
  tags: string[];
  scanDepth: number;
  tokenBudget: number;
  recursionEnabled: boolean;
  origin: WorldPackOrigin;
  parentPackIds: string[];   // 融合卡的源卡 id 列表，便于追溯
  version: number;
  createdAt: string;
  updatedAt: string;
}

// 卡牌内的世界观条目。
// 结构与 WorldEntryRecord 平行（含 keys/position/probability），但归属于卡牌而非项目。
// activator 消费时会投影为 WorldEntryRecord 形态。
export interface WorldPackEntryRecord {
  id: string;
  packId: string;
  category: string;
  title: string;
  content: string;
  aliases: string[];
  tags: string[];
  keys: string[];
  position: WorldEntryPosition;
  probability: number;
  order: number;
  // ----- v25 · CCv3 兼容字段（同 WorldEntryRecord）-----
  secondaryKeys: string[];
  selectiveLogic: "and_any" | "not_all" | "not_any" | "and_all";
  caseSensitive: boolean;
  constant: boolean;
  extensions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// 项目-卡牌插槽（多对多）。
// 引用模式：删除插槽不影响卡牌本体；删除卡牌通过 FK ON DELETE CASCADE 自动清理所有引用它的插槽。
// enabled=false 表示"插着但临时禁用"，slot_order 控制 activator 注入顺序与重复时的优先级。
export interface ProjectWorldPackSlotRecord {
  projectId: string;
  packId: string;
  slotOrder: number;
  enabled: boolean;
  addedAt: string;
}

// ---------- v24 · Author's Note ----------

// Author's Note 注入位置：
//   before —— 拼到 user prompt 前（适合做"全局风格/世界观锚点"，让 LLM 一开始就知道）
//   after  —— 拼到 user prompt 后（适合做"严格遵守"指令，靠近输出更不易被忽略）
export type AuthorNotePosition = "before" | "after";

// 项目级 Author's Note。每项目最多一条（DB UNIQUE 约束）。
// enabled=false 时本条不参与注入但保留内容，便于"草稿态/线上态"快速切换。
export interface AuthorNoteRecord {
  id: string;
  projectId: string;
  text: string;
  position: AuthorNotePosition;
  enabled: boolean;
  updatedAt: string;
}

// ---------- v25 · CCv3 兼容字段 ----------

// 多关键词命中后的判定逻辑（对齐 SillyTavern world_info_logic）。
//   and_any  —— 主 keys 任一命中 且 secondaryKeys 任一命中（默认）
//   not_all  —— 主 keys 任一命中 且 不全部 secondaryKeys 命中
//   not_any  —— 主 keys 任一命中 且 secondaryKeys 一个都没命中
//   and_all  —— 主 keys 任一命中 且 secondaryKeys 全部命中
// 注：当 secondaryKeys 为空时，always 退化为"仅判主 keys"，不影响旧行为。
export type WorldEntrySelectiveLogic = "and_any" | "not_all" | "not_any" | "and_all";

// ---------- v26 · Voice Profile + World Info Trace ----------

// 写作声音档案（Novel Engine 启发）。answers 是问卷原始答案，
// promptBlock 是把答案模板化后的注入文本（缓存避免每次重渲）。
export interface VoiceProfileRecord {
  id: string;
  projectId: string;
  answers: Record<string, string>;
  promptBlock: string;
  enabled: boolean;
  completedAt: string | null;
  updatedAt: string;
}

// 单条 entry 在某次激活中的命中详情（来自 activator 的 trace 数组）。
export interface WorldInfoEntryTrace {
  entryId: string;
  packId: string | null;
  title: string;
  category: string;
  matched: boolean;
  matchedKeys: string[];
  selectiveLogic: WorldEntrySelectiveLogic;
  secondaryMatched: string[];
  rolled: number | null;
  probability: number;
  passedProbability: boolean;
  constant: boolean;
  injected: boolean;
  droppedReason: "logic_failed" | "prob_failed" | "budget_exceeded" | null;
  approxChars: number;
}

// 一次完整 World Info 激活的快照，落 world_info_traces 表，UI 诊断面板用。
export interface WorldInfoTraceRecord {
  id: string;
  projectId: string;
  runId: string | null;
  scene: string;
  scanTextPreview: string;
  entries: WorldInfoEntryTrace[];
  charsUsed: number;
  charBudget: number;
  createdAt: string;
}

// ---------- M4 · Research ----------

export type ResearchProvider =
  | "tavily"
  | "bing"
  | "serpapi"
  | "llm-fallback"
  | "manual";

export interface ResearchNoteRecord {
  id: string;
  projectId: string;
  topic: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceProvider: ResearchProvider;
  excerpt: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSearchHit {
  title: string;
  url: string;
  snippet: string;
  provider: ResearchProvider;
  score?: number;
}

// ---------- M4 · Review ----------

export type ReviewBuiltinId =
  | "consistency-character"
  | "consistency-timeline"
  | "foreshadowing"
  | "worldbuilding"
  | "style";

export type ReviewDimensionKind = "builtin" | "skill";

export type ReviewScope = "book" | "chapter" | "selection";

export type ReviewSeverity = "info" | "warn" | "error";

export type ReviewReportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ReviewDimensionRecord {
  id: string;
  projectId: string | null;
  name: string;
  kind: ReviewDimensionKind;
  builtinId: ReviewBuiltinId | null;
  skillId: string | null;
  scope: ReviewScope;
  severity: ReviewSeverity;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReportSummary {
  totals: Record<ReviewSeverity, number>;
  perDimension: Array<{ dimensionId: string; count: number }>;
  perChapter: Array<{ chapterId: string; count: number }>;
  usage?: SkillRunUsage;
}

export interface ReviewReportRecord {
  id: string;
  projectId: string;
  rangeKind: "book" | "chapter" | "range";
  rangeIds: string[];
  startedAt: string;
  finishedAt: string | null;
  status: ReviewReportStatus;
  summary: ReviewReportSummary;
  error: string | null;
}

export interface ReviewFindingRecord {
  id: string;
  reportId: string;
  dimensionId: string;
  chapterId: string | null;
  excerpt: string;
  excerptStart: number | null;
  excerptEnd: number | null;
  severity: ReviewSeverity;
  suggestion: string;
  dismissed: boolean;
  createdAt: string;
}

// ---------- M4 · Daily Summary ----------

export interface DailySummaryRecord {
  date: string;
  projectId: string;
  wordsAdded: number;
  goal: number;
  goalHit: boolean;
  summary: string | null;
  summaryProviderId: string | null;
  summaryModel: string | null;
  generatedAt: string | null;
}

// ---------- M4 · Provider Multi-Key ----------

export type ProviderKeyStrategy =
  | "single"
  | "round-robin"
  | "weighted"
  | "sticky";

export interface ProviderKeyRecord {
  id: string;
  providerId: string;
  label: string;
  weight: number;
  disabled: boolean;
  storedInKeychain: boolean;
  lastFailedAt: string | null;
  failCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderKeyHealth {
  keyId: string;
  label: string;
  disabled: boolean;
  recentSuccesses: number;
  recentFailures: number;
  cooldownUntil: string | null;
}

export interface ProviderHealthSnapshot {
  providerId: string;
  strategy: ProviderKeyStrategy;
  cooldownMs: number;
  keys: ProviderKeyHealth[];
}

// =====================================================================
// M7 · Bookshelf Module (Plan: shiny-booping-honey.md, schema v14)
// 该段类型完全独立，不修改任何现有表对应的 Record 形状。
// =====================================================================

/** 章节来源：模型初稿 / 模型陪写 / 纯手写。旧章节没标记时按 'manual' 渲染。 */
export type ChapterOrigin = "ai-auto" | "ai-assisted" | "manual";

/** 章节日志条目类型。 */
export type ChapterLogEntryKind =
  | "progress" // 章节状态从 in_progress → completed 时自动追加
  | "ai-run" // AutoWriter 运行结束时自动追加
  | "manual" // 用户手动追加
  | "daily-reminder"; // 每日 12:00 提醒触发后用户记录

/** 日志条目作者。 */
export type ChapterLogEntryAuthor = "user" | "ai";

/** 章节快照类型。pre-* 在动作前打，post-* 在完成后打，manual 是用户主动备份。 */
export type ChapterSnapshotKind =
  | "manual"
  | "pre-ai"
  | "post-ai"
  | "pre-rewrite"
  | "pre-restore"
  | "auto-periodic";

/** AutoWriter 多 Agent 协作中的 4 个角色。 */
export type AutoWriterAgentRole = "planner" | "writer" | "critic" | "reflector";

export const AUTO_WRITER_DEFAULTS = {
  targetSegmentLength: 650,
  maxSegments: 5,
  maxRewritesPerSegment: 1,
  enableOocGate: true,
  speedMode: "quality",
} as const;

export const AUTO_WRITER_FAST_PRESET = {
  targetSegmentLength: 700,
  maxSegments: 7,
  maxRewritesPerSegment: 0,
  enableOocGate: false,
  speedMode: "fast",
} as const;

export const AUTO_WRITER_PARAMETER_LIMITS = {
  targetSegmentLength: { min: 120, max: 1200 },
  maxSegments: { min: 1, max: 16 },
  maxRewritesPerSegment: { min: 0, max: 3 },
  temperature: { min: 0, max: 1 },
  maxTokens: { min: 256, max: 8000 },
} as const;

export const AUTO_WRITER_ROLE_DEFAULTS = {
  planner: { temperature: 0.25, maxTokens: 900 },
  writer: { temperature: 0.72, maxTokens: 3200 },
  critic: { temperature: 0.15, maxTokens: 900 },
  reflector: { temperature: 0.25, maxTokens: 450 },
} as const satisfies Record<
  AutoWriterAgentRole,
  { temperature: number; maxTokens: number }
>;

/** AutoWriter 一次运行的状态机。
 * v22+: 加 `partial` —— 跑到一半失败但已落盘 N 段，UI 用此状态告诉用户
 * "前 N 段保留可用"，区别于完全空跑的 `failed`。
 */
export type AutoWriterRunStatus =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "partial"
  | "stopped";

export interface BookCoverRecord {
  id: string;
  projectId: string;
  /** 相对项目根的路径，例如 `.bookshelf/cover.png`。 */
  filePath: string;
  mime: string;
  uploadedAt: string;
}

export interface ChapterOriginTagRecord {
  chapterId: string;
  origin: ChapterOrigin;
  taggedAt: string;
}

export interface ChapterLogRecord {
  id: string;
  chapterId: string;
  projectId: string;
  createdAt: string;
}

/**
 * v22+: 每章一份摘要（100~200 字），AutoWriter 跨章节注入用。
 * chapter_id 既是 PK 也是 FK，重生成走 INSERT OR REPLACE。
 */
export interface ChapterSummaryRecord {
  chapterId: string;
  projectId: string;
  summary: string;
  /** 哪个 model 摘要的（便于事后切主力 LLM 时一键重摘）。 */
  model: string | null;
  providerId: string | null;
  /** 摘要时章节正文字数（如果章节后续被改长，可据此判断是否过期）。 */
  sourceWordCount: number;
  generatedAt: string;
}

export interface ChapterLogEntryRecord {
  id: string;
  logId: string;
  chapterId: string;
  kind: ChapterLogEntryKind;
  author: ChapterLogEntryAuthor;
  content: string;
  /** 自由结构的元数据：tokens / runId / rewrites 等。 */
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ChapterSnapshotRecord {
  id: string;
  chapterId: string;
  projectId: string;
  kind: ChapterSnapshotKind;
  /** 用户为手动快照命名；自动快照可为 null。 */
  label: string | null;
  /** sha256(content)，用于去重检测。 */
  contentHash: string;
  /** 相对项目根：`.history/snapshots/<chapId>/<id>.md`。 */
  filePath: string;
  wordCount: number;
  /** 关联到 auto_writer_runs.id；手动快照为 null。 */
  runId: string | null;
  /** 关联到具体的 Agent；手动快照为 null。 */
  agentRole: AutoWriterAgentRole | null;
  /** 关联到 ai_feedbacks.id 或 tavern_messages.id（若适用）。 */
  sourceMessageId: string | null;
  createdAt: string;
}

/** AutoWriter 一个角色与 LLM provider/model 的绑定。 */
export interface AutoWriterAgentBinding {
  role: AutoWriterAgentRole;
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AutoWriterCorrectionEntry {
  at: string;
  content: string;
  /** 用户标记的错误段落原文片段，便于 Critic / Writer 定位。 */
  targetExcerpt?: string;
}

export interface AutoWriterRunRecord {
  id: string;
  projectId: string;
  chapterId: string;
  status: AutoWriterRunStatus;
  /** 用户初始输入的多行思路。 */
  userIdeas: string;
  /** 中途介入累积的纠错列表。 */
  userCorrections: AutoWriterCorrectionEntry[];
  /** 4 个角色的模型绑定。可只配置一个 'writer' 表示统一模型。 */
  agentsConfig: AutoWriterAgentBinding[];
  /** Planner 产出的 beat sheet（保持 JSON 字符串，方便 schema 演进）。 */
  outlineJson: string | null;
  /** 统计：tokensIn/Out、段数、重写次数、耗时等。 */
  statsJson: Record<string, unknown>;
  lastSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

// =====================================================================
// M8 · 活人感套装：成就 + 角色来信
// =====================================================================

/**
 * 成就 ID。前端的徽章目录与该 ID 一一对应（catalog 在 shared/achievements.ts）。
 * 字符串列表保持开放式：未来追加只需扩 catalog，无需改表。
 */
export type AchievementId =
  // 字数里程碑
  | "first_word"
  | "words_1k"
  | "words_5k"
  | "words_10k"
  | "words_50k"
  | "words_100k"
  | "words_300k"
  // 章节
  | "first_chapter"
  | "chapters_5"
  | "chapters_20"
  | "chapters_50"
  // 连续打卡
  | "streak_3"
  | "streak_7"
  | "streak_30"
  // 时段
  | "night_owl" // 0-3 点写作
  | "early_bird" // 5-7 点写作
  | "weekend_warrior" // 周末写满日目标
  // 角色 / 世界观
  | "first_character"
  | "characters_5"
  | "characters_15"
  | "character_breathes" // 有一张较完整的人物档案
  | "first_world_entry"
  | "worldbuilder" // 5 条世界观条目
  | "lore_keeper" // 有一条较完整的世界观条目
  // AI / 工具
  | "first_auto_writer_run"
  | "auto_writer_3"
  | "first_letter_received"
  | "letters_pen_pal" // 收 5 封信
  | "first_review" // 第一次 Review
  | "backup_charm" // 第一次手动快照
  | "snapshot_keeper" // 创建 10 个手动快照
  | "named_chapter" // 标题有戏的章节
  | "short_blade" // 短章节
  | "long_breath" // 单章 2000 字
  | "rewrite_master"; // 单段重写 ≥3 次仍出稿

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface AchievementUnlockedRecord {
  id: string;
  projectId: string;
  achievementId: AchievementId;
  unlockedAt: string;
  metadata: Record<string, unknown>;
}

/**
 * 角色来信「语气」。AI 生成时强约束这一字段以保证多样性。
 *  - grateful：感谢戏份 / 角色发展
 *  - complaint：抱怨太久没出场或台词糟糕
 *  - curious：对剧情走向好奇 / 提问
 *  - encouraging：鼓励作者坚持
 *  - neutral：日常 / 无特殊情绪
 */
export type CharacterLetterTone =
  | "grateful"
  | "complaint"
  | "curious"
  | "encouraging"
  | "neutral";

export interface CharacterLetterRecord {
  id: string;
  projectId: string;
  characterId: string;
  subject: string;
  body: string;
  tone: CharacterLetterTone;
  generatedAt: string;
  read: boolean;
  pinned: boolean;
  dismissed: boolean;
  providerId: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
}

// =====================================================================
// v20 · Materials (素材库) — independent top-level inspiration store.
// Orthogonal to sample_libs (style references), world_entries (lore graph),
// research_notes (web clippings). Backs the standalone "素材库" page.
// =====================================================================

export type MaterialKind =
  | "idea"
  | "plot"
  | "character"
  | "location"
  | "world"
  | "fragment"
  | "reference"
  | "note";

export interface MaterialRecord {
  id: string;
  projectId: string;
  kind: MaterialKind;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
