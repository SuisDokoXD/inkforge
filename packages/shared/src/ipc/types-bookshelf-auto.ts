import type {
  AIFeedbackRecord,
  AppSettings,
  ChapterRecord,
  CharacterSyncLogRecord,
  CompactResult,
  DailyProgressRecord,
  DailySummaryRecord,
  NovelCharacterRecord,
  OutlineCardRecord,
  ProjectRecord,
  ProviderHealthSnapshot,
  ProviderKeyRecord,
  ProviderKeyStrategy,
  ProviderRecord,
  ProviderVendor,
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSearchHit,
  ReviewBuiltinId,
  ReviewDimensionKind,
  ReviewDimensionRecord,
  ReviewFindingRecord,
  ReviewReportRecord,
  ReviewReportStatus,
  ReviewReportSummary,
  ReviewScope,
  ReviewSeverity,
  SkillDefinition,
  SkillImportReport,
  SkillPackV1,
  SkillRunUsage,
  SkillScope,
  SkillTriggerType,
  SyncDiffRow,
  TavernCardRecord,
  TavernMessageRecord,
  TavernMode,
  TavernSessionRecord,
  TokenBudgetState,
  WorldEntryRecord,
  WorldEntryPosition,
  WorldEntrySelectiveLogic,
  // ----- v23: Worldview Cards -----
  WorldPackRecord,
  WorldPackEntryRecord,
  WorldPackOrigin,
  ProjectWorldPackSlotRecord,
  // ----- v24: Author's Note -----
  AuthorNoteRecord,
  AuthorNotePosition,
  // ----- v26: Voice Profile + World Info Trace -----
  VoiceProfileRecord,
  WorldInfoTraceRecord,
  // ----- M7 · Bookshelf -----
  AutoWriterAgentBinding,
  AutoWriterAgentRole,
  AutoWriterCorrectionEntry,
  AutoWriterRunRecord,
  AutoWriterRunStatus,
  BookCoverRecord,
  ChapterLogEntryKind,
  ChapterLogEntryRecord,
  ChapterOrigin,
  ChapterOriginTagRecord,
  ChapterSnapshotKind,
  ChapterSnapshotRecord,
  // ----- Scene Bindings -----
  SceneBindingRecord,
  SceneKey,
  SceneRoutingMode,
  // ----- Sample Library -----
  SampleLibRecord,
  SampleChunkRecord,
  // ----- World Relationships -----
  WorldRelationshipRecord,
  WorldGraphEndpointKind,
} from "../domain";

import { ipcChannels, ipcEventChannels } from "./channels";

export interface BookSummary {
  project: ProjectRecord;
  cover: BookCoverRecord | null;
  chapterCount: number;
  totalWords: number;
  /** 当日新增字数（按 daily_logs 取）。 */
  todayWords: number;
  /** 最近一次章节更新的 ISO 时间，便于按"最近编辑"排序。 */
  lastChapterUpdatedAt: string | null;
  /** 各 origin 分类的章节数。'manual' 包含未打标签的旧章节。 */
  originCounts: Record<ChapterOrigin, number>;
}

export type BookshelfListBooksResponse = BookSummary[];

// ---------- Bookshelf · 封面 ----------

export interface BookCoverUploadInput {
  projectId: string;
  /** 原始文件名，用于推断扩展名。 */
  fileName: string;
  /** Base64-encoded bytes，主进程解码后写入。 */
  base64: string;
  mime: string;
}

export interface BookCoverUploadResponse {
  cover: BookCoverRecord;
}

export interface BookCoverGetInput {
  projectId: string;
}

export interface BookCoverGetResponse {
  cover: BookCoverRecord | null;
  /** 若 cover 存在，返回 base64 内容供 renderer 直接显示。 */
  base64: string | null;
}

export interface BookCoverDeleteInput {
  projectId: string;
}

// ---------- Origin Tag ----------

export interface OriginTagSetInput {
  chapterId: string;
  origin: ChapterOrigin;
}

export interface OriginTagGetInput {
  chapterId: string;
}

export interface OriginTagListByOriginInput {
  projectId: string;
  origin: ChapterOrigin;
  /**
   * 仅 origin === 'manual' 时生效。默认 true：把未打标签的旧章节也纳入此分类。
   * 这样老用户进入书房时不需要批量打标。
   */
  includeUntagged?: boolean;
}

export interface OriginTagListByOriginResponse {
  chapterIds: string[];
}

// ---------- Chapter Log ----------

export interface ChapterLogListInput {
  chapterId: string;
  limit?: number;
  /** 默认 true：最新在前。 */
  desc?: boolean;
}

export interface ChapterLogAppendManualInput {
  chapterId: string;
  projectId: string;
  content: string;
}

export interface ChapterLogAppendAiInput {
  chapterId: string;
  projectId: string;
  /** AI 触发的日志类型：ai-run / progress 二选一。 */
  kind: Extract<ChapterLogEntryKind, "ai-run" | "progress">;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChapterLogDeleteInput {
  entryId: string;
}

// ---------- Auto Writer ----------

export interface AutoWriterStartInput {
  projectId: string;
  chapterId: string;
  userIdeas: string;
  /**
   * Agent 与模型的绑定。常见两种形态：
   *   - 默认（统一模型）：传 1 条带 role='writer' 的 binding，主进程把它复制给其他 3 个角色
   *   - 高级（分别绑定）：传 4 条 binding，每条对应一个角色
   */
  agents: AutoWriterAgentBinding[];
  /** 单段长度目标（字数），默认 650。 */
  targetSegmentLength?: number;
  /** 期望段数上限（含 Planner 提的 beat 数）。默认 5。 */
  maxSegments?: number;
  /** 单段最多重写次数（Critic 不通过时回炉次数上限），默认 1。 */
  maxRewritesPerSegment?: number;
  /** 是否启用 OOC 守门员（默认 true）。 */
  enableOocGate?: boolean;
  /** Optional sample libraries to use as style references. Empty/omitted = auto from all imported libs. */
  sampleLibIds?: string[];
  /**
   * 速度策略：
   * - fast: Planner + Writer，跳过逐段 Critic / Reflector / 自动重写，适合长章快速出稿。
   * - quality: 完整多 Agent 流程，适合需要严谨校对的章节。
   */
  speedMode?: "fast" | "quality";
}

export interface AutoWriterStartResponse {
  runId: string;
  status: "started";
}

export interface AutoWriterStopInput {
  runId: string;
}

export interface AutoWriterStopResponse {
  runId: string;
  stopped: true;
}

export interface AutoWriterPauseInput {
  runId: string;
}

export interface AutoWriterResumeInput {
  runId: string;
}

export interface AutoWriterGetRunInput {
  runId: string;
}

export interface AutoWriterListRunsInput {
  /** chapterId 与 projectId 至少传一个。 */
  chapterId?: string;
  projectId?: string;
  limit?: number;
  status?: AutoWriterRunStatus;
}

export interface AutoWriterInjectIdeaInput {
  runId: string;
  /** 用户中途追加的思路/约束，下一段 Writer 会作为 extraSystem 注入。 */
  content: string;
}

export interface AutoWriterCorrectInput {
  runId: string;
  content: string;
  /** 用户标记的错误段落原文片段，便于 Critic / Writer 定位。 */
  targetExcerpt?: string;
}

export interface AutoWriterCorrectResponse {
  runId: string;
  correction: AutoWriterCorrectionEntry;
  run: AutoWriterRunRecord;
}

// ---------- Auto Writer · 流式事件 ----------

export interface AutoWriterChunkEvent {
  runId: string;
  chapterId: string;
  agentRole: AutoWriterAgentRole;
  segmentIndex: number;
  delta: string;
  /**
   * Deprecated compatibility field. New emitters should send only `delta`
   * because repeatedly IPC-copying the full accumulated text grows O(n^2)
   * during long AutoWriter runs.
   */
  accumulatedText?: string;
  emittedAt: string;
}

/** 状态机切换事件。前端用它驱动「Phase 指示器」。 */
export type AutoWriterPhase =
  | "planner"
  | "writer"
  | "critic"
  | "reflector"
  | "rewrite-segment"
  | "next-segment"
  | "done";

export interface AutoWriterPhaseEvent {
  runId: string;
  chapterId: string;
  phase: AutoWriterPhase;
  segmentIndex: number;
  /** 仅 phase='rewrite-segment' 时有：本段累计重写次数（含本次）。 */
  rewriteCount?: number;
  /** 仅 phase='critic' 完成时有：findings 按 severity 计数。 */
  criticSummary?: { errorCount: number; warnCount: number; infoCount: number };
  emittedAt: string;
}

export interface AutoWriterDoneEvent {
  runId: string;
  chapterId: string;
  status: AutoWriterRunStatus;
  totalSegments: number;
  totalRewrites: number;
  totalTokensIn: number;
  totalTokensOut: number;
  error?: string;
  finishedAt: string;
}

export interface AutoWriterSnapshotEvent {
  runId: string;
  chapterId: string;
  snapshot: ChapterSnapshotRecord;
  emittedAt: string;
}

// ---------- Snapshot ----------

export interface SnapshotCreateInput {
  chapterId: string;
  projectId: string;
  /** 用户为手动快照命名，可选；自动快照传 null。 */
  label?: string | null;
  /** 默认 'manual'。 */
  kind?: ChapterSnapshotKind;
  /** 关联的 AutoWriter 运行 id。 */
  runId?: string;
  agentRole?: AutoWriterAgentRole;
  sourceMessageId?: string;
}

export interface SnapshotCreateResponse {
  snapshot: ChapterSnapshotRecord;
}

export interface SnapshotListInput {
  chapterId: string;
  limit?: number;
  kinds?: ChapterSnapshotKind[];
  runId?: string;
}

export interface SnapshotGetInput {
  snapshotId: string;
}

export interface SnapshotGetResponse {
  snapshot: ChapterSnapshotRecord;
  /** 快照文件正文（utf-8）。 */
  content: string;
}

export interface SnapshotRestoreInput {
  snapshotId: string;
}

export interface SnapshotRestoreResponse {
  /** 被还原回章节的快照。 */
  restored: ChapterSnapshotRecord;
  /** 还原前自动产生的 'pre-restore' 快照（让还原本身也可撤销）。 */
  preRestoreSnapshot: ChapterSnapshotRecord;
  /** 还原后章节最新内容（renderer 用它刷新编辑器）。 */
  chapterContent: string;
}

export interface SnapshotDeleteInput {
  snapshotId: string;
}

// ---------- 每日日志提醒 ----------

export interface ChapterLogDailyReminderEvent {
  /** 该提醒覆盖的项目和章节范围；空表示全局提醒。 */
  projectId?: string;
  chapterIds?: string[];
  emittedAt: string;
}

// ---------- 通过接口合并扩展请求/事件映射 ----------

declare module "./maps" {
  interface IpcRequestMap {
    // Bookshelf
    [ipcChannels.bookshelfListBooks]: { req: void; res: BookshelfListBooksResponse };
    [ipcChannels.bookCoverUpload]: { req: BookCoverUploadInput; res: BookCoverUploadResponse };
    [ipcChannels.bookCoverGet]: { req: BookCoverGetInput; res: BookCoverGetResponse };
    [ipcChannels.bookCoverDelete]: {
      req: BookCoverDeleteInput;
      res: { projectId: string };
    };
    // Origin Tag
    [ipcChannels.originTagSet]: {
      req: OriginTagSetInput;
      res: ChapterOriginTagRecord;
    };
    [ipcChannels.originTagGet]: {
      req: OriginTagGetInput;
      res: ChapterOriginTagRecord | null;
    };
    [ipcChannels.originTagListByOrigin]: {
      req: OriginTagListByOriginInput;
      res: OriginTagListByOriginResponse;
    };
    // Chapter Log
    [ipcChannels.chapterLogList]: {
      req: ChapterLogListInput;
      res: ChapterLogEntryRecord[];
    };
    [ipcChannels.chapterLogAppendManual]: {
      req: ChapterLogAppendManualInput;
      res: ChapterLogEntryRecord;
    };
    [ipcChannels.chapterLogAppendAi]: {
      req: ChapterLogAppendAiInput;
      res: ChapterLogEntryRecord;
    };
    [ipcChannels.chapterLogDelete]: {
      req: ChapterLogDeleteInput;
      res: { entryId: string };
    };
    // Auto Writer
    [ipcChannels.autoWriterStart]: {
      req: AutoWriterStartInput;
      res: AutoWriterStartResponse;
    };
    [ipcChannels.autoWriterStop]: {
      req: AutoWriterStopInput;
      res: AutoWriterStopResponse;
    };
    [ipcChannels.autoWriterPause]: {
      req: AutoWriterPauseInput;
      res: AutoWriterRunRecord;
    };
    [ipcChannels.autoWriterResume]: {
      req: AutoWriterResumeInput;
      res: AutoWriterRunRecord;
    };
    [ipcChannels.autoWriterGetRun]: {
      req: AutoWriterGetRunInput;
      res: AutoWriterRunRecord | null;
    };
    [ipcChannels.autoWriterListRuns]: {
      req: AutoWriterListRunsInput;
      res: AutoWriterRunRecord[];
    };
    [ipcChannels.autoWriterInjectIdea]: {
      req: AutoWriterInjectIdeaInput;
      res: AutoWriterRunRecord;
    };
    [ipcChannels.autoWriterCorrect]: {
      req: AutoWriterCorrectInput;
      res: AutoWriterCorrectResponse;
    };
    // Snapshot
    [ipcChannels.snapshotCreate]: {
      req: SnapshotCreateInput;
      res: SnapshotCreateResponse;
    };
    [ipcChannels.snapshotList]: {
      req: SnapshotListInput;
      res: ChapterSnapshotRecord[];
    };
    [ipcChannels.snapshotGet]: {
      req: SnapshotGetInput;
      res: SnapshotGetResponse;
    };
    [ipcChannels.snapshotRestore]: {
      req: SnapshotRestoreInput;
      res: SnapshotRestoreResponse;
    };
    [ipcChannels.snapshotDelete]: {
      req: SnapshotDeleteInput;
      res: { snapshotId: string };
    };
    // Window
    [ipcChannels.windowMinimize]: { req: void; res: { ok: true } };
    [ipcChannels.windowToggleMaximize]: { req: void; res: { isMaximized: boolean } };
    [ipcChannels.windowClose]: { req: void; res: { ok: true } };
    [ipcChannels.windowIsMaximized]: { req: void; res: { isMaximized: boolean } };
  }
}

declare module "./maps" {
  interface IpcEventMap {
    [ipcEventChannels.autoWriterChunk]: AutoWriterChunkEvent;
    [ipcEventChannels.autoWriterPhase]: AutoWriterPhaseEvent;
    [ipcEventChannels.autoWriterDone]: AutoWriterDoneEvent;
    [ipcEventChannels.autoWriterSnapshot]: AutoWriterSnapshotEvent;
    [ipcEventChannels.chapterLogReminder]: ChapterLogDailyReminderEvent;
    [ipcEventChannels.windowMaximizedChanged]: { isMaximized: boolean };
  }
}

// =====================================================================
// M8 · 活人感 IpcRequestMap / IpcEventMap 扩展
// =====================================================================

