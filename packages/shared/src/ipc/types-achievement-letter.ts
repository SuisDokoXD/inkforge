import type {
  AIFeedbackRecord,
  AppSettings,
  ChapterRecord,
  CharacterSyncLogRecord,
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

export interface LetterArrivedEvent {
  projectId: string;
  letter: import("../domain").CharacterLetterRecord;
}

// 通过同文件 interface declaration merging 把 M8 接入主映射
// （TS 同名 interface 自动合并）
declare module "./maps" {
  interface IpcRequestMap {
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
    [ipcEventChannels.letterArrived]: LetterArrivedEvent;
  }
}

// =====================================================================
// Scene Bindings (ported from ainovel) · IpcRequestMap extension
