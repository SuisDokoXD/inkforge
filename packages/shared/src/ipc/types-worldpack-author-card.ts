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

export interface WorldPackListInput {
  search?: string;
  origin?: WorldPackOrigin;
  limit?: number;
}
export interface WorldPackGetInput {
  id: string;
}
export interface WorldPackCreateInput {
  name: string;
  tagline?: string;
  description?: string;
  tags?: string[];
  scanDepth?: number;
  tokenBudget?: number;
  recursionEnabled?: boolean;
}
export interface WorldPackUpdateInput {
  id: string;
  name?: string;
  tagline?: string;
  description?: string;
  coverPath?: string | null;
  coverMime?: string | null;
  tags?: string[];
  scanDepth?: number;
  tokenBudget?: number;
  recursionEnabled?: boolean;
}
export interface WorldPackDeleteInput {
  id: string;
}
export interface WorldPackEntryListInput {
  packId: string;
}
export interface WorldPackEntryCreateInput {
  packId: string;
  category: string;
  title: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  order?: number;
  // ----- v25 · CCv3 兼容字段 -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}
export interface WorldPackEntryUpdateInput {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  order?: number;
  // ----- v25 · CCv3 兼容字段（未传 = 不动该列） -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}
export interface WorldPackEntryDeleteInput {
  id: string;
}
export interface WorldPackSlotListInput {
  projectId: string;
}
export interface WorldPackSlotAddInput {
  projectId: string;
  packId: string;
  slotOrder?: number;
  enabled?: boolean;
}
export interface WorldPackSlotRemoveInput {
  projectId: string;
  packId: string;
}
export interface WorldPackSlotToggleInput {
  projectId: string;
  packId: string;
  enabled: boolean;
}
export interface WorldPackSlotReorderInput {
  projectId: string;
  orderedPackIds: string[];
}
export interface WorldPackCoverWriteInput {
  packId: string;
  // 文件相对扩展名（'png' / 'jpg' / 'webp' / 'gif'）；主进程会按 packId + ext 落到 .world-packs/
  ext: string;
  // 二进制数据，渲染端用 ArrayBuffer 传过来
  bytes: ArrayBuffer | Uint8Array;
  mime: string;
}
export interface WorldPackCoverWriteResponse {
  coverPath: string;
  coverMime: string;
}
export interface WorldPackCoverReadInput {
  packId: string;
  coverPath: string;
}
export interface WorldPackCoverReadResponse {
  // base64 data URL，渲染端 <img src={url}/> 直接用
  dataUrl: string | null;
}
export interface WorldPackFuseSuggestion {
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  entries: Array<{
    category: string;
    title: string;
    content: string;
    aliases: string[];
    keys: string[];
  }>;
}
export interface WorldPackFuseInput {
  sourcePackIds: string[];
  brief: string;              // 用户的融合 brief（"重点保留 X，融合 Y 风格"）
  providerId?: string;        // 可选，缺省走 active provider
  model?: string;
  // 是否立即写库存为新卡：true=直接落库返回 WorldPackRecord；false=只返回融合预览（dryRun）
  persist?: boolean;
  // 保存已审核过的预览时传入，避免保存动作再次调用模型生成另一版内容。
  suggestion?: WorldPackFuseSuggestion;
}
export interface WorldPackFuseResponse {
  // 融合产物：建议的卡牌主信息 + entries 列表
  suggestion: WorldPackFuseSuggestion;
  // 若 persist=true 同时返回落库后的 pack record
  pack?: WorldPackRecord;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.worldPackList]: { req: WorldPackListInput; res: WorldPackRecord[] };
    [ipcChannels.worldPackGet]: { req: WorldPackGetInput; res: WorldPackRecord | null };
    [ipcChannels.worldPackCreate]: { req: WorldPackCreateInput; res: WorldPackRecord };
    [ipcChannels.worldPackUpdate]: { req: WorldPackUpdateInput; res: WorldPackRecord };
    [ipcChannels.worldPackDelete]: { req: WorldPackDeleteInput; res: { id: string } };
    [ipcChannels.worldPackEntryList]: {
      req: WorldPackEntryListInput;
      res: WorldPackEntryRecord[];
    };
    [ipcChannels.worldPackEntryCreate]: {
      req: WorldPackEntryCreateInput;
      res: WorldPackEntryRecord;
    };
    [ipcChannels.worldPackEntryUpdate]: {
      req: WorldPackEntryUpdateInput;
      res: WorldPackEntryRecord;
    };
    [ipcChannels.worldPackEntryDelete]: {
      req: WorldPackEntryDeleteInput;
      res: { id: string };
    };
    [ipcChannels.worldPackSlotList]: {
      req: WorldPackSlotListInput;
      res: ProjectWorldPackSlotRecord[];
    };
    [ipcChannels.worldPackSlotAdd]: {
      req: WorldPackSlotAddInput;
      res: ProjectWorldPackSlotRecord;
    };
    [ipcChannels.worldPackSlotRemove]: {
      req: WorldPackSlotRemoveInput;
      res: { projectId: string; packId: string };
    };
    [ipcChannels.worldPackSlotToggle]: {
      req: WorldPackSlotToggleInput;
      res: ProjectWorldPackSlotRecord | null;
    };
    [ipcChannels.worldPackSlotReorder]: {
      req: WorldPackSlotReorderInput;
      res: { ok: true };
    };
    [ipcChannels.worldPackCoverWrite]: {
      req: WorldPackCoverWriteInput;
      res: WorldPackCoverWriteResponse;
    };
    [ipcChannels.worldPackCoverRead]: {
      req: WorldPackCoverReadInput;
      res: WorldPackCoverReadResponse;
    };
    [ipcChannels.worldPackFuse]: { req: WorldPackFuseInput; res: WorldPackFuseResponse };
  }
}

// =====================================================================
// v24 · Author's Note · IpcRequestMap extension
// =====================================================================

export interface AuthorNoteGetInput {
  projectId: string;
}
export interface AuthorNoteUpsertInput {
  projectId: string;
  text?: string;
  position?: AuthorNotePosition;
  enabled?: boolean;
}
export interface AuthorNoteDeleteInput {
  projectId: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.authorNoteGet]: { req: AuthorNoteGetInput; res: AuthorNoteRecord | null };
    [ipcChannels.authorNoteUpsert]: { req: AuthorNoteUpsertInput; res: AuthorNoteRecord };
    [ipcChannels.authorNoteDelete]: { req: AuthorNoteDeleteInput; res: { projectId: string } };
  }
}

// =====================================================================
// v25 · Character Card (CCv3) import / export · IpcRequestMap extension
// =====================================================================
// 角色卡 / Lorebook 跨规范导入导出：
//   - import：传 sourcePath（绝对路径）→ 主进程读文件 + 解析 + 落库，返回新 pack
//   - export：传 packId + format/outputPath → 写文件
//   - listImports：分页查 character_card_imports 历史，UI 上做"我导过的卡"列表

export interface CharacterCardImportInput {
  sourcePath: string;
}
export interface CharacterCardImportResponse {
  packId: string;
  pack: WorldPackRecord;
  alreadyImported: boolean;
  entryCount: number;
}

export interface CharacterCardExportInput {
  packId: string;
  format: "json" | "png" | "inkcard";
  outputPath: string;
  // 当 format=png/inkcard 时可选：传基础底图字节数组（来自 renderer File.arrayBuffer()）。
  // 省略则用透明 1x1 PNG 兜底。
  coverBytes?: ArrayBuffer;
}
export interface CharacterCardExportResponse {
  outputPath: string;
  byteCount: number;
}

export interface CharacterCardListImportsInput {
  limit?: number;
}
export interface CharacterCardImportRecordLite {
  id: string;
  sourcePath: string;
  contentHash: string;
  packId: string | null;
  importedAt: string;
  spec: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.characterCardImport]: {
      req: CharacterCardImportInput;
      res: CharacterCardImportResponse;
    };
    [ipcChannels.characterCardExport]: {
      req: CharacterCardExportInput;
      res: CharacterCardExportResponse;
    };
    [ipcChannels.characterCardListImports]: {
      req: CharacterCardListImportsInput;
      res: CharacterCardImportRecordLite[];
    };
  }
}

// =====================================================================
// v26 · Voice Profile · IpcRequestMap extension
// =====================================================================
// 一项目一条"声音档案"。CRUD 收敛为 upsert + getByProject + setEnabled。

export interface VoiceProfileGetInput {
  projectId: string;
}
export interface VoiceProfileUpsertInput {
  projectId: string;
  answers: Record<string, string>;
  // renderer 可以选择不传 promptBlock，让 service 自己渲染（推荐）
  promptBlock?: string;
  enabled?: boolean;
  completedAt?: string | null;
}
export interface VoiceProfileSetEnabledInput {
  projectId: string;
  enabled: boolean;
}
export interface VoiceProfileDeleteInput {
  projectId: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.voiceProfileGet]: {
      req: VoiceProfileGetInput;
      res: VoiceProfileRecord | null;
    };
    [ipcChannels.voiceProfileUpsert]: {
      req: VoiceProfileUpsertInput;
      res: VoiceProfileRecord;
    };
    [ipcChannels.voiceProfileSetEnabled]: {
      req: VoiceProfileSetEnabledInput;
      res: { projectId: string; enabled: boolean };
    };
    [ipcChannels.voiceProfileDelete]: {
      req: VoiceProfileDeleteInput;
      res: { projectId: string };
    };
  }
}

// =====================================================================
// v26 · World Info Trace · IpcRequestMap extension
// =====================================================================
// 激活诊断面板用：列最近 N 条、按 id 看详情、清空。

export interface WorldInfoTraceListRecentInput {
  projectId: string;
  limit?: number;
}
export interface WorldInfoTraceGetInput {
  id: string;
}
export interface WorldInfoTraceClearInput {
  projectId: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.worldInfoTraceListRecent]: {
      req: WorldInfoTraceListRecentInput;
      res: WorldInfoTraceRecord[];
    };
    [ipcChannels.worldInfoTraceGet]: {
      req: WorldInfoTraceGetInput;
      res: WorldInfoTraceRecord | null;
    };
    [ipcChannels.worldInfoTraceClear]: {
      req: WorldInfoTraceClearInput;
      res: { projectId: string };
    };
  }
}

// =====================================================================
// Review · Audit→Fix（两步审查的"修复"阶段）
// =====================================================================
