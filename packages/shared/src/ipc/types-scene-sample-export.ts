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

export interface SceneBindingListResponse {
  mode: SceneRoutingMode;
  basic: SceneBindingRecord[];
  advanced: SceneBindingRecord[];
}

export interface SceneBindingUpsertInput {
  mode: SceneRoutingMode;
  sceneKey: SceneKey;
  providerId: string | null;
  model: string | null;
}

export interface SceneBindingResetInput {
  mode: SceneRoutingMode;
  sceneKey: SceneKey;
}

export interface SceneBindingSetModeInput {
  mode: SceneRoutingMode;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.sceneBindingList]: {
      req: void;
      res: SceneBindingListResponse;
    };
    [ipcChannels.sceneBindingUpsert]: {
      req: SceneBindingUpsertInput;
      res: SceneBindingRecord;
    };
    [ipcChannels.sceneBindingReset]: {
      req: SceneBindingResetInput;
      res: { sceneKey: SceneKey };
    };
    [ipcChannels.sceneBindingGetMode]: {
      req: void;
      res: { mode: SceneRoutingMode };
    };
    [ipcChannels.sceneBindingSetMode]: {
      req: SceneBindingSetModeInput;
      res: { mode: SceneRoutingMode };
    };
  }
}

// =====================================================================
// Sample Library (参考小说库, ported from ainovel) · IpcRequestMap extension
// =====================================================================

export interface SampleLibListInput {
  projectId: string;
}

export interface SampleLibCreateInput {
  projectId: string;
  title: string;
  author?: string;
  notes?: string;
  /** Pre-built chunks (e.g. from manual paste). */
  chunks?: Array<{ ordinal: number; chapterTitle?: string; text: string }>;
}

export interface SampleLibDeleteInput {
  libId: string;
}

export interface SampleLibImportTextInput {
  projectId: string;
  title: string;
  author?: string;
  notes?: string;
  /** Raw plain-text content; service splits by `第 X 章` regex. */
  text: string;
}

export interface SampleLibImportEpubInput {
  projectId: string;
  /** Absolute path to the EPUB file (selected via fs.pickFile). */
  filePath: string;
  /** Optional override; defaults to OPF metadata. */
  title?: string;
  author?: string;
  notes?: string;
}

export interface SampleLibImportResponse {
  lib: SampleLibRecord;
  chunkCount: number;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.sampleLibList]: {
      req: SampleLibListInput;
      res: SampleLibRecord[];
    };
    [ipcChannels.sampleLibCreate]: {
      req: SampleLibCreateInput;
      res: SampleLibRecord;
    };
    [ipcChannels.sampleLibDelete]: {
      req: SampleLibDeleteInput;
      res: { libId: string };
    };
    [ipcChannels.sampleLibImportText]: {
      req: SampleLibImportTextInput;
      res: SampleLibImportResponse;
    };
    [ipcChannels.sampleLibImportEpub]: {
      req: SampleLibImportEpubInput;
      res: SampleLibImportResponse;
    };
  }
}

// =====================================================================
// World Relationships (graph, ported from ainovel) · IpcRequestMap extension
// =====================================================================

export interface WorldRelationshipListInput {
  projectId: string;
}

export interface WorldRelationshipSaveInput {
  /** Optional id; absent = create. */
  id?: string;
  projectId: string;
  srcKind: WorldGraphEndpointKind;
  srcId: string;
  dstKind: WorldGraphEndpointKind;
  dstId: string;
  label?: string | null;
  weight?: number;
}

export interface WorldRelationshipDeleteInput {
  id: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.worldRelationshipList]: {
      req: WorldRelationshipListInput;
      res: WorldRelationshipRecord[];
    };
    [ipcChannels.worldRelationshipSave]: {
      req: WorldRelationshipSaveInput;
      res: WorldRelationshipRecord;
    };
    [ipcChannels.worldRelationshipDelete]: {
      req: WorldRelationshipDeleteInput;
      res: { id: string };
    };
  }
}

// =====================================================================
// Project Export + Chapter Bulk Import (ported from ainovel) · IpcRequestMap
// =====================================================================

export interface ProjectExportInput {
  projectId: string;
  /** Optional override; absent triggers save dialog. */
  outputPath?: string;
  /** Optional override; falls back to project.title. */
  fileName?: string;
}

export interface ProjectExportResponse {
  projectId: string;
  outputPath: string;
  byteCount: number;
  chapterCount: number;
}

export interface ProjectPackageExportInput {
  projectId: string;
  /** Optional override; absent triggers save dialog. */
  outputPath?: string;
  /** Optional override; falls back to project name. */
  fileName?: string;
}

export interface ProjectPackageExportResponse {
  projectId: string;
  outputPath: string;
  byteCount: number;
  manifestVersion: number;
  chapterCount: number;
  characterCount: number;
  worldEntryCount: number;
  materialCount: number;
  sampleLibCount: number;
  snapshotCount: number;
}

export interface ProjectPackageImportInput {
  /** Absolute path to a `.inkforge.zip` package. Absent triggers open dialog. */
  filePath?: string;
  /** Optional imported project name. Absent uses the package project name plus an import suffix. */
  nameOverride?: string;
}

export interface ProjectPackageImportResponse {
  projectId: string;
  name: string;
  path: string;
  manifestVersion: number;
  chapterCount: number;
  characterCount: number;
  worldEntryCount: number;
  materialCount: number;
  sampleLibCount: number;
  snapshotCount: number;
}

export interface ChapterImportTxtInput {
  projectId: string;
  filePath: string;
}

export interface ChapterImportEpubInput {
  projectId: string;
  filePath: string;
}

export interface ChapterImportBulkResponse {
  projectId: string;
  created: number;
  /** Imported chapter IDs (top-level only). */
  chapterIds: string[];
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.projectExportTxt]: { req: ProjectExportInput; res: ProjectExportResponse };
    [ipcChannels.projectExportMd]: { req: ProjectExportInput; res: ProjectExportResponse };
    [ipcChannels.projectExportHtml]: { req: ProjectExportInput; res: ProjectExportResponse };
    [ipcChannels.projectExportDocx]: { req: ProjectExportInput; res: ProjectExportResponse };
    [ipcChannels.projectExportEpub]: { req: ProjectExportInput; res: ProjectExportResponse };
    [ipcChannels.projectPackageExport]: { req: ProjectPackageExportInput; res: ProjectPackageExportResponse };
    [ipcChannels.projectPackageImport]: { req: ProjectPackageImportInput; res: ProjectPackageImportResponse };
    [ipcChannels.chapterImportTxt]: { req: ChapterImportTxtInput; res: ChapterImportBulkResponse };
    [ipcChannels.chapterImportEpub]: { req: ChapterImportEpubInput; res: ChapterImportBulkResponse };
  }
}

// =====================================================================
// Module 6: AI outline + chapter generation (ainovel-style chained)
// =====================================================================

export interface ProjectUpdateMetaInput {
  projectId: string;
  synopsis?: string;
  genre?: string;
  subGenre?: string;
  tags?: string[];
  globalWorldview?: string;
}

export interface OutlineGenerateMasterInput {
  projectId: string;
  /** Override the saved synopsis/genre at call time (optional). */
  synopsis?: string;
  genre?: string;
  subGenre?: string;
  tags?: string[];
  globalWorldview?: string;
  /** Provider override (else use scene_binding 'outline_generation'). */
  providerId?: string;
  model?: string;
}

export interface OutlineGenerateMasterResponse {
  projectId: string;
  masterOutline: string;
  durationMs: number;
}

export interface OutlineGenerateChaptersInput {
  projectId: string;
  /** Target chapter count; LLM may emit fewer/more. Default 12. */
  targetCount?: number;
  /** If true, replace existing outline_cards with chapterId=null. Default false (append). */
  replaceExisting?: boolean;
  providerId?: string;
  model?: string;
}

export interface OutlineGenerateChaptersResponse {
  projectId: string;
  cardIds: string[];
  durationMs: number;
}

export type OutlineRefineTarget =
  | { kind: "master"; projectId: string }
  | { kind: "card"; cardId: string };

export interface OutlineRefineInput {
  target: OutlineRefineTarget;
  intent: string;
  providerId?: string;
  model?: string;
}

export interface OutlineRefineResponse {
  /** New text. For master target, also persisted to projects.master_outline. */
  text: string;
  /** Whether an undo snapshot was saved (master only). */
  hasUndo: boolean;
  durationMs: number;
}

export interface OutlineUndoRefineInput {
  /** Master-level undo only (cards undo handled inline by frontend). */
  projectId: string;
}

export interface OutlineUndoRefineResponse {
  projectId: string;
  /** Restored master outline text; empty when no snapshot existed. */
  masterOutline: string;
  restored: boolean;
}

export interface ChapterGenerateFromOutlineInput {
  projectId: string;
  /** Outline card to source the chapter from. */
  outlineCardId: string;
  /** Number of parallel candidates 1/2/3. Default 1. */
  candidates?: 1 | 2 | 3;
  /** If provided, includes prior chapter's tail as continuity context. */
  prevChapterId?: string;
  providerId?: string;
  model?: string;
  /** Optional sample libraries to use as style references. Empty/omitted = auto from all imported libs. */
  sampleLibIds?: string[];
  /** Override; default 6000. */
  maxTokens?: number;
}

export interface ChapterGenerateFromOutlineResponse {
  /** N candidate texts (caller picks one and calls chapterCommitDraft). */
  candidates: Array<{
    text: string;
    durationMs: number;
    providerId: string;
  }>;
  outlineCardId: string;
  outlineTitle: string;
}

export interface ChapterCommitDraftInput {
  projectId: string;
  /** Selected candidate text from chapter:generate-from-outline. */
  text: string;
  /** Title to use for the new (or existing) chapter. */
  title: string;
  /** If present, overwrite this chapter's file. Else create a new chapter. */
  chapterId?: string;
  /** Optional outline card to link via outline_cards.chapter_id. */
  outlineCardId?: string;
}

export interface ChapterCommitDraftResponse {
  chapterId: string;
  filePath: string;
  wordCount: number;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.projectUpdateMeta]: { req: ProjectUpdateMetaInput; res: import("../domain").ProjectRecord };
    [ipcChannels.outlineGenerateMaster]: { req: OutlineGenerateMasterInput; res: OutlineGenerateMasterResponse };
    [ipcChannels.outlineGenerateChapters]: { req: OutlineGenerateChaptersInput; res: OutlineGenerateChaptersResponse };
    [ipcChannels.outlineRefine]: { req: OutlineRefineInput; res: OutlineRefineResponse };
    [ipcChannels.outlineUndoRefine]: { req: OutlineUndoRefineInput; res: OutlineUndoRefineResponse };
    [ipcChannels.chapterGenerateFromOutline]: { req: ChapterGenerateFromOutlineInput; res: ChapterGenerateFromOutlineResponse };
    [ipcChannels.chapterCommitDraft]: { req: ChapterCommitDraftInput; res: ChapterCommitDraftResponse };
  }
}

// =====================================================================
// Provider remote model list (fetch /v1/models or vendor equivalent)
// =====================================================================

export interface ProviderListRemoteModelsInput {
  /** Either reference an existing saved provider by id ... */
  providerId?: string;
  /** ... or pass ad-hoc credentials (used in the "新建 provider" flow before save). */
  vendor?: import("../domain").ProviderVendor;
  baseUrl?: string;
  apiKey?: string;
}

export interface RemoteModelInfo {
  id: string;
  /** Optional vendor-supplied owner ("openai" / "system" / etc). */
  ownedBy?: string;
  /** Optional context window in tokens. */
  contextLength?: number;
  /** Optional human label. */
  displayName?: string;
}

export interface ProviderListRemoteModelsResponse {
  models: RemoteModelInfo[];
  /** Vendor-reported total or models.length when not paginated. */
  count: number;
  durationMs: number;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.providerListRemoteModels]: {
      req: ProviderListRemoteModelsInput;
      res: ProviderListRemoteModelsResponse;
    };
  }
}

// =====================================================================
// v20 · Materials (素材库) IPC contract
// =====================================================================

export interface MaterialListInput {
  projectId: string;
  kind?: import("../domain").MaterialKind;
}

export type MaterialListResponse = import("../domain").MaterialRecord[];

export interface MaterialCreateInput {
  projectId: string;
  kind: import("../domain").MaterialKind;
  title: string;
  content?: string;
  tags?: string[];
}

export interface MaterialUpdateInput {
  id: string;
  kind?: import("../domain").MaterialKind;
  title?: string;
  content?: string;
  tags?: string[];
}

export interface MaterialDeleteInput {
  id: string;
}

export interface MaterialDeleteResponse {
  id: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.materialList]: { req: MaterialListInput; res: MaterialListResponse };
    [ipcChannels.materialCreate]: {
      req: MaterialCreateInput;
      res: import("../domain").MaterialRecord;
    };
    [ipcChannels.materialUpdate]: {
      req: MaterialUpdateInput;
      res: import("../domain").MaterialRecord;
    };
    [ipcChannels.materialDelete]: {
      req: MaterialDeleteInput;
      res: MaterialDeleteResponse;
    };
  }
}

// =====================================================================
