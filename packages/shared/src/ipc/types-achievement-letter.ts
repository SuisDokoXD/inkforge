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

export interface AchievementListInput {
  projectId: string;
}

export interface AchievementCheckInput {
  projectId: string;
  /** 触发原因：用于在多个事件源里去重检查；可选。 */
  trigger?:
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
}

export interface AchievementCheckResponse {
  newlyUnlocked: import("../domain").AchievementUnlockedRecord[];
}

export interface AchievementStatsResponse {
  totalUnlocked: number;
  totalCatalog: number;
  /** 各 rarity 解锁数量。 */
  byRarity: Record<import("../domain").AchievementRarity, number>;
  /** 累计字数 / 章节数 / 角色数 / 世界观条目 / AutoWriter 次数等概要。 */
  stats: {
    totalWords: number;
    totalChapters: number;
    totalCharacters: number;
    totalWorldEntries: number;
    autoWriterRuns: number;
    snapshotsManual: number;
    streakDays: number;
    longestStreak: number;
  };
}

export interface LetterListInput {
  projectId: string;
  includeDismissed?: boolean;
  characterId?: string;
  limit?: number;
}

export interface LetterGenerateInput {
  projectId: string;
  /** 留空让 service 自动挑一个最久没出场的角色。 */
  characterId?: string;
  /** 留空让 service 随机挑（带权重，complaint 概率较低）。 */
  tone?: import("../domain").CharacterLetterTone;
  /** 用于 LLM 调用：指定 provider/model；省略走默认。 */
  providerId?: string;
  model?: string;
}

export interface LetterMarkReadInput {
  letterId: string;
  read: boolean;
}

export interface LetterPinInput {
  letterId: string;
  pinned: boolean;
}

export interface LetterDismissInput {
  letterId: string;
}

export interface LetterDeleteInput {
  letterId: string;
}

export interface AchievementUnlockedEvent {
  projectId: string;
  achievement: import("../domain").AchievementUnlockedRecord;
}

export interface LetterArrivedEvent {
  projectId: string;
  letter: import("../domain").CharacterLetterRecord;
}

export interface IpcRequestMapM8 {
  [ipcChannels.achievementList]: {
    req: AchievementListInput;
    res: import("../domain").AchievementUnlockedRecord[];
  };
  [ipcChannels.achievementCheck]: {
    req: AchievementCheckInput;
    res: AchievementCheckResponse;
  };
  [ipcChannels.achievementStats]: {
    req: { projectId: string };
    res: AchievementStatsResponse;
  };
  [ipcChannels.letterList]: {
    req: LetterListInput;
    res: import("../domain").CharacterLetterRecord[];
  };
  [ipcChannels.letterGenerate]: {
    req: LetterGenerateInput;
    res: import("../domain").CharacterLetterRecord;
  };
  [ipcChannels.letterMarkRead]: {
    req: LetterMarkReadInput;
    res: { letterId: string };
  };
  [ipcChannels.letterPin]: {
    req: LetterPinInput;
    res: { letterId: string };
  };
  [ipcChannels.letterDismiss]: {
    req: LetterDismissInput;
    res: { letterId: string };
  };
  [ipcChannels.letterDelete]: {
    req: LetterDeleteInput;
    res: { letterId: string };
  };
}

// 通过同文件 interface declaration merging 把 M8 接入主映射
// （TS 同名 interface 自动合并）
declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.achievementList]: {
      req: AchievementListInput;
      res: import("../domain").AchievementUnlockedRecord[];
    };
    [ipcChannels.achievementCheck]: {
      req: AchievementCheckInput;
      res: AchievementCheckResponse;
    };
    [ipcChannels.achievementStats]: {
      req: { projectId: string };
      res: AchievementStatsResponse;
    };
    [ipcChannels.letterList]: {
      req: LetterListInput;
      res: import("../domain").CharacterLetterRecord[];
    };
    [ipcChannels.letterGenerate]: {
      req: LetterGenerateInput;
      res: import("../domain").CharacterLetterRecord;
    };
    [ipcChannels.letterMarkRead]: {
      req: LetterMarkReadInput;
      res: { letterId: string };
    };
    [ipcChannels.letterPin]: {
      req: LetterPinInput;
      res: { letterId: string };
    };
    [ipcChannels.letterDismiss]: {
      req: LetterDismissInput;
      res: { letterId: string };
    };
    [ipcChannels.letterDelete]: {
      req: LetterDeleteInput;
      res: { letterId: string };
    };
  }
}

declare module "./maps" {
  interface IpcEventMap {
    [ipcEventChannels.achievementUnlocked]: AchievementUnlockedEvent;
    [ipcEventChannels.letterArrived]: LetterArrivedEvent;
  }
}

// =====================================================================
// Scene Bindings (ported from ainovel) · IpcRequestMap extension
