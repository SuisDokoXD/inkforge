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

export interface ProjectCreateInput {
  name: string;
  /** Absolute path; if omitted, server places project under workspaceDir/projects/<safe-name>. */
  path?: string;
  dailyGoal?: number;
}

export interface ProjectUpdateInput {
  id: string;
  name?: string;
  dailyGoal?: number;
}

export interface ProjectDeleteInput {
  id: string;
  removeFiles?: boolean;
}

export interface ProjectOpenInput {
  id: string;
}

export interface ChapterCreateInput {
  projectId: string;
  parentId?: string | null;
  title: string;
  order?: number;
  status?: string;
  wordCount?: number;
  filePath: string;
}

export interface ChapterUpdateInput {
  id: string;
  title?: string;
  status?: string;
  wordCount?: number;
  filePath?: string;
  content?: string;
}

export interface ChapterListInput {
  projectId: string;
}

export interface ChapterReadInput {
  id: string;
}

export interface ChapterReadResponse {
  chapter: ChapterRecord;
  content: string;
}

export interface ChapterDeleteInput {
  id: string;
}

export interface ChapterReorderInput {
  projectId: string;
  orderedIds: string[];
}

export interface ChapterImportMdInput {
  projectId: string;
  title?: string;
  content: string;
  parentId?: string | null;
}

export interface ChapterExportMdInput {
  id: string;
}

export interface ChapterExportMdResponse {
  id: string;
  title: string;
  fileName: string;
  content: string;
  savedPath?: string;
}

export interface ChapterAutosaveWriteInput {
  id: string;
  content: string;
}

export interface ChapterAutosavePeekInput {
  id: string;
}

export interface ChapterAutosavePeekResponse {
  /** null when no autosave exists or it is not newer than the last DB save. */
  content: string | null;
  /** Autosave file mtime (ms) when present. */
  savedAt: number | null;
  /** Chapter row `updatedAt` (ms) used for the staleness comparison. */
  chapterUpdatedAt: number | null;
}

export interface ChapterAutosaveClearInput {
  id: string;
}

export interface FeedbackListInput {
  chapterId: string;
  limit?: number;
}

export interface FeedbackDismissInput {
  id: string;
  dismissed?: boolean;
}

export interface FeedbackDeleteEmptyInput {
  chapterId: string;
}

export interface FeedbackClearChapterInput {
  chapterId: string;
}

export interface ProviderSaveInput {
  id?: string;
  label: string;
  vendor: ProviderVendor;
  baseUrl?: string;
  apiKey?: string;
  defaultModel: string;
  tags?: string[];
}

export interface ProviderDeleteInput {
  id: string;
}

export interface ProviderTestInput {
  id: string;
}

export interface ProviderTestResponse {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface LLMAnalyzeInput {
  projectId: string;
  chapterId: string;
  chapterText: string;
  providerId?: string;
  model?: string;
  trigger?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMAnalyzeResponse {
  analysisId: string;
  status: "started";
}

export interface LLMChunkEvent {
  analysisId: string;
  projectId: string;
  chapterId: string;
  delta: string;
  accumulatedText: string;
  providerId: string;
  emittedAt: string;
}

export interface LLMDoneEvent {
  analysisId: string;
  projectId: string;
  chapterId: string;
  providerId: string;
  status: "completed" | "failed";
  error?: string;
  feedback?: AIFeedbackRecord;
}

export type LLMQuickActionKind =
  | "polish"
  | "critique"
  | "continue"
  | "inspire"
  | "rephrase";

export interface LLMQuickActionInput {
  kind: LLMQuickActionKind;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  persona?: string;
  options?: number;
  extraInstruction?: string;
  projectId?: string;
  chapterId?: string;
}

export interface LLMQuickActionResponse {
  actionId: string;
  kind: LLMQuickActionKind;
  status: "completed" | "failed";
  text?: string;
  options?: string[];
  error?: string;
  durationMs: number;
  providerId: string;
}

export interface LLMChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMChatInput {
  messages: LLMChatMessage[];
  providerId?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  projectId?: string;
  chapterId?: string;
  chapterExcerpt?: string;
}

export interface LLMChatResponse {
  messageId: string;
  status: "completed" | "failed";
  text?: string;
  error?: string;
  durationMs: number;
  providerId: string;
}

export interface OutlineCreateInput {
  projectId: string;
  chapterId?: string | null;
  title: string;
  content?: string;
  status?: string;
  order?: number;
}

export interface OutlineUpdateInput {
  id: string;
  title?: string;
  content?: string;
  status?: string;
  order?: number;
  chapterId?: string | null;
}

export interface OutlineDeleteInput {
  id: string;
}

export interface OutlineListInput {
  projectId: string;
  chapterId?: string;
}

export interface DailyProgressInput {
  projectId: string;
  date?: string;
}

export interface SettingsGetInput {
  key?: string;
}

export interface SettingsSetInput {
  updates: Partial<AppSettings>;
}

export interface DiagSnapshotInput {
  tailLines?: number;
}

export interface DiagSnapshotResponse {
  text: string;
  generatedAt: string;
}

export interface DiagCrashStatusResponse {
  crashed: boolean;
  crashedAt: number | null;
  reason: string | null;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string; releaseUrl: string | null }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

export interface MarketSkillMetaDTO {
  id: string;
  title: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  scope: SkillScope;
  url: string;
  license?: string;
  homepage?: string;
}

export interface MarketRegistryDTO {
  format: "inkforge-market.v1";
  updatedAt: string;
  skills: MarketSkillMetaDTO[];
}

export interface MarketFetchRegistryInput {
  registryUrl?: string;
}

export interface MarketInstallSkillInput {
  url: string;
  scope?: SkillScope;
  projectId?: string | null;
}

export interface MarketInstallSkillResponse {
  installed: boolean;
  skillId: string;
}

export interface MarketBuildPublishBundleInput {
  skillId: string;
}

export interface MarketBuildPublishBundleResponse {
  skillJson: string;
  prInstructions: string;
}

export interface FsPickFileInput {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface FsPickFileResponse {
  path: string | null;
  content: string | null;
  fileName: string | null;
}

export interface FsSaveFileInput {
  defaultPath?: string;
  content: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface FsSaveFileResponse {
  path: string | null;
}

export interface TerminalSpawnInput {
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
}

export interface TerminalSpawnResponse {
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalInputPayload {
  id: string;
  data: string;
}

export interface TerminalResizePayload {
  id: string;
  cols: number;
  rows: number;
}

export interface TerminalDisposePayload {
  id: string;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

export interface SkillCreateInput {
  name: string;
  prompt: string;
  variables: SkillDefinition["variables"];
  triggers: SkillDefinition["triggers"];
  binding: SkillDefinition["binding"];
  output: SkillDefinition["output"];
  enabled?: boolean;
  scope: SkillScope;
}

export interface SkillUpdateInput {
  id: string;
  name?: string;
  prompt?: string;
  variables?: SkillDefinition["variables"];
  triggers?: SkillDefinition["triggers"];
  binding?: SkillDefinition["binding"];
  output?: SkillDefinition["output"];
  enabled?: boolean;
  scope?: SkillScope;
}

export interface SkillGetInput {
  id: string;
}

export interface SkillListInput {
  scope?: SkillScope;
  enabledOnly?: boolean;
  projectId?: string;
}

export interface SkillDeleteInput {
  id: string;
}

export interface SkillRunInput {
  skillId: string;
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
  selection?: string;
  character?: {
    id?: string;
    name?: string;
    persona?: string;
  };
  manualVariables?: Record<string, string>;
  triggerType?: SkillTriggerType;
  persist?: boolean;
}

export interface SkillRunResponse {
  runId: string;
  status: "started";
}

export interface SkillImportJsonInput {
  content: string;
  onConflict?: "replace" | "skip" | "rename";
  scopeOverride?: SkillScope;
}

export interface SkillExportJsonInput {
  ids?: string[];
  scope?: SkillScope;
  includeDisabled?: boolean;
}

export interface SkillExportJsonResponse {
  fileName: string;
  content: string;
  format: SkillPackV1["format"];
  version: SkillPackV1["version"];
}

export interface SkillChunkEvent {
  runId: string;
  skillId: string;
  projectId: string;
  chapterId: string;
  delta: string;
  accumulatedText: string;
  providerId: string;
  model: string;
  emittedAt: string;
}

export interface SkillDoneEvent {
  runId: string;
  skillId: string;
  projectId: string;
  chapterId: string;
  status: "completed" | "failed" | "cancelled";
  error?: string;
  feedbackId?: string;
  /** 完成时的最终输出文本，供前端按 output target 写入编辑器（非时间线输出场景）。 */
  text?: string;
  usage?: SkillRunUsage;
  finishedAt: string;
}

export interface TavernCardCreateInput {
  name: string;
  persona: string;
  avatarPath?: string | null;
  providerId: string;
  model: string;
  temperature?: number;
  linkedNovelCharacterId?: string | null;
  syncMode?: TavernCardRecord["syncMode"];
}

export interface TavernCardUpdateInput {
  id: string;
  name?: string;
  persona?: string;
  avatarPath?: string | null;
  providerId?: string;
  model?: string;
  temperature?: number;
  linkedNovelCharacterId?: string | null;
  syncMode?: TavernCardRecord["syncMode"];
}

export interface TavernCardGetInput {
  id: string;
}

export interface TavernCardListInput {
  projectId?: string;
}

export interface TavernCardDeleteInput {
  id: string;
}

export interface NovelCharacterCreateInput {
  projectId: string;
  name: string;
  persona?: string | null;
  traits?: Record<string, unknown>;
  backstory?: string;
  relations?: Array<{ otherId: string; label: string }>;
  linkedTavernCardId?: string | null;
}

export interface NovelCharacterUpdateInput {
  id: string;
  name?: string;
  persona?: string | null;
  traits?: Record<string, unknown>;
  backstory?: string;
  relations?: Array<{ otherId: string; label: string }>;
  linkedTavernCardId?: string | null;
}

export interface NovelCharacterGetInput {
  id: string;
}

export interface NovelCharacterListInput {
  projectId: string;
}

export interface NovelCharacterDeleteInput {
  id: string;
}

export interface NovelCharacterExtractInput {
  projectId: string;
  chapterId: string;
  maxCandidates?: number;
}

export interface NovelCharacterExtractCandidate {
  name: string;
  aliases: string[];
  persona: string;
  backstory: string;
  evidence: string;
  confidence: number;
}

export interface NovelCharacterExtractRelation {
  sourceName: string;
  targetName: string;
  label: string;
  evidence: string;
  confidence: number;
}

export interface NovelCharacterExtractResponse {
  chapterId: string;
  chapterTitle: string;
  candidates: NovelCharacterExtractCandidate[];
  relationships: NovelCharacterExtractRelation[];
  providerId: string | null;
  model: string | null;
}

export interface NovelCharacterImportCandidatesInput {
  projectId: string;
  chapterId?: string;
  candidates: NovelCharacterExtractCandidate[];
  relationships?: NovelCharacterExtractRelation[];
}

export interface NovelCharacterImportCandidatesResponse {
  created: NovelCharacterRecord[];
  skipped: Array<{
    name: string;
    reason: "empty" | "exists";
  }>;
  relationships: Array<{
    sourceId: string;
    targetId: string;
    label: string;
  }>;
}

export type CharacterSyncRequestDirection = "novel_to_card" | "card_to_novel" | "auto";

export interface CharacterSyncPreviewInput {
  novelCharId: string;
  tavernCardId: string;
  direction?: CharacterSyncRequestDirection;
}

export interface CharacterSyncPreviewResponse {
  diffs: SyncDiffRow[];
}

export interface CharacterSyncResolutionInput {
  field: SyncDiffRow["field"];
  winner: "novel" | "card";
}

export interface CharacterSyncApplyInput {
  novelCharId: string;
  tavernCardId: string;
  direction: CharacterSyncRequestDirection;
  resolutions?: CharacterSyncResolutionInput[];
}

export interface CharacterSyncApplyResponse {
  updatedNovelCharacter: NovelCharacterRecord;
  updatedTavernCard: TavernCardRecord;
  logsWritten: number;
}

export interface CharacterSyncHistoryInput {
  novelCharId?: string;
  tavernCardId?: string;
  limit?: number;
}

export interface TavernSessionCreateInput {
  projectId: string;
  title: string;
  topic: string;
  mode: TavernMode;
  budgetTokens: number;
  summaryProviderId?: string;
  summaryModel?: string;
  lastK?: number;
}

export interface TavernSessionGetInput {
  sessionId: string;
}

export interface TavernSessionListInput {
  projectId: string;
  limit?: number;
}

export interface TavernSessionDeleteInput {
  sessionId: string;
}

export interface TavernMessageListInput {
  sessionId: string;
  limit?: number;
  beforeCreatedAt?: string;
  order?: "asc" | "desc";
}

export interface TavernDirectorPostInput {
  sessionId: string;
  content: string;
}

export interface TavernDirectorPostResponse {
  messageId: string;
}

export interface TavernRoundRunInput {
  sessionId: string;
  mode?: TavernMode;
  participants: string[];
  lastK?: number;
  autoRounds?: number;
  directorMessage?: string;
}

export interface TavernRoundRunResponse {
  roundId: string;
  status: "started";
}

export interface TavernRoundStopInput {
  roundId: string;
}

export interface TavernRoundStopResponse {
  roundId: string;
  stopped: true;
}

export interface TavernSummaryCompactInput {
  sessionId: string;
  keepLastK: number;
}

export interface TavernChunkEvent {
  roundId: string;
  sessionId: string;
  speakerCardId: string;
  speakerName: string;
  delta: string;
  accumulatedText: string;
  providerId: string;
  model: string;
  emittedAt: string;
}

export interface TavernDoneEvent {
  roundId: string;
  sessionId: string;
  speakerCardId: string;
  messageId?: string;
  status: "completed" | "failed" | "stopped";
  usage?: SkillRunUsage;
  error?: string;
  finishedAt: string;
}

export interface TavernBudgetWarningEvent {
  sessionId: string;
  remainingTokens: number;
  estimatedNextRoundTokens: number;
  threshold: number;
  emittedAt: string;
  state?: TokenBudgetState;
}

// ---------- M4 · World ----------
export interface WorldListInput {
  projectId: string;
  category?: string;
  search?: string;
}
export interface WorldGetInput {
  id: string;
}
export interface WorldCreateInput {
  projectId: string;
  category: string;
  title: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  // ----- v22 · World Info 自动注入字段（全可选，缺省走 SQL DEFAULT） -----
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  // ----- v25 · CCv3 兼容字段（全可选，缺省走 SQL DEFAULT） -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}
export interface WorldUpdateInput {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  // ----- v22 · World Info 自动注入字段（全可选，未传 = 不动该列） -----
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  // ----- v25 · CCv3 兼容字段（未传 = 不动该列） -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}
export interface WorldDeleteInput {
  id: string;
}
export interface WorldSearchInput {
  projectId: string;
  query: string;
  limit?: number;
}

// ---------- M4 · Research ----------
export interface ResearchSearchInput {
  projectId: string;
  query: string;
  provider?: ResearchProvider;
  topK?: number;
  apiKey?: string;
}
export interface ResearchSearchResponse {
  hits: ResearchSearchHit[];
  usedProvider: ResearchProvider;
  fellBackToLlm?: boolean;
  error?: string;
  expandedQueries?: string[];
  attemptedProviders?: ResearchProvider[];
}
export interface ResearchListInput {
  projectId: string;
  topic?: string;
  limit?: number;
}
export interface ResearchGetInput {
  id: string;
}
export interface ResearchSaveInput {
  projectId: string;
  topic: string;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceProvider: ResearchProvider;
  excerpt: string;
  note?: string;
  tags?: string[];
}
export interface ResearchUpdateInput {
  id: string;
  topic?: string;
  note?: string;
  tags?: string[];
}
export interface ResearchDeleteInput {
  id: string;
}

export interface ResearchCredentialStatus {
  provider: ResearchProvider;
  configured: boolean;
}
export interface ResearchCredentialStatusInput {
  providers?: ResearchProvider[];
}
export interface ResearchCredentialUpsertInput {
  provider: ResearchProvider;
  apiKey: string;
}
export interface ResearchCredentialDeleteInput {
  provider: ResearchProvider;
}

// ---------- M4 · Review ----------
export interface ReviewDimListInput {
  projectId: string;
}
export interface ReviewDimUpsertInput {
  id?: string;
  projectId: string | null;
  name: string;
  kind: ReviewDimensionKind;
  builtinId?: ReviewBuiltinId | null;
  skillId?: string | null;
  scope?: ReviewScope;
  severity?: ReviewSeverity;
  enabled?: boolean;
  order?: number;
}
export interface ReviewDimDeleteInput {
  id: string;
}
export interface ReviewDimReorderInput {
  projectId: string;
  orderedIds: string[];
}
export interface ReviewRunInput {
  projectId: string;
  rangeKind: "book" | "chapter" | "range";
  rangeIds?: string[];
  dimensionIds?: string[];
  providerId?: string;
  model?: string;
}
export interface ReviewRunResponse {
  reportId: string;
  status: "started";
}
export interface ReviewCancelInput {
  reportId: string;
}
export interface ReviewCancelResponse {
  reportId: string;
  cancelled: true;
}
export interface ReviewListInput {
  projectId: string;
  limit?: number;
}
export interface ReviewGetInput {
  reportId: string;
}
export interface ReviewGetResponse {
  report: ReviewReportRecord;
  findings: ReviewFindingRecord[];
}
export interface ReviewDismissFindingInput {
  findingId: string;
  dismissed?: boolean;
}
export interface ReviewDismissFindingResponse {
  findingId: string;
  dismissed: boolean;
}
export interface ReviewExportInput {
  reportId: string;
  format?: "md";
}
export interface ReviewExportResponse {
  fileName: string;
  content: string;
  format: "md";
}
export interface ReviewProgressEvent {
  reportId: string;
  phase: "map" | "reduce" | "persist";
  processedChapters: number;
  totalChapters: number;
  partialFindings?: number;
  emittedAt: string;
}
export interface ReviewDoneEvent {
  reportId: string;
  status: ReviewReportStatus;
  summary?: ReviewReportSummary;
  error?: string;
  finishedAt: string;
}

// ---------- M4 · Daily summary ----------
export interface DailySummaryGenerateInput {
  projectId: string;
  date?: string;
  providerId?: string;
  model?: string;
}
export interface DailySummaryGenerateResponse {
  summaryId: string;
  status: "started";
}
export interface DailySummaryGetInput {
  projectId: string;
  date: string;
}
export interface DailySummaryListInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
export interface DailySummaryChunkEvent {
  summaryId: string;
  projectId: string;
  date: string;
  delta: string;
  accumulatedText: string;
  emittedAt: string;
}
export interface DailySummaryDoneEvent {
  summaryId: string;
  projectId: string;
  date: string;
  status: "completed" | "failed" | "cancelled";
  summary?: string;
  error?: string;
  finishedAt: string;
}

// ---------- M4 · Provider Multi-Key ----------
export interface ProviderKeyListInput {
  providerId: string;
}
export interface ProviderKeyUpsertInput {
  providerId: string;
  id?: string;
  label: string;
  apiKey?: string;
  weight?: number;
  disabled?: boolean;
  strategy?: ProviderKeyStrategy;
  cooldownMs?: number;
}
export interface ProviderKeyDeleteInput {
  id: string;
}
export interface ProviderKeySetDisabledInput {
  id: string;
  disabled: boolean;
}
export interface ProviderKeyHealthInput {
  providerId: string;
}

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.projectCreate]: { req: ProjectCreateInput; res: ProjectRecord };
    [ipcChannels.projectList]: { req: void; res: ProjectRecord[] };
    [ipcChannels.projectUpdate]: { req: ProjectUpdateInput; res: ProjectRecord };
    [ipcChannels.projectDelete]: { req: ProjectDeleteInput; res: { id: string } };
    [ipcChannels.projectOpen]: { req: ProjectOpenInput; res: ProjectRecord };
    [ipcChannels.chapterCreate]: { req: ChapterCreateInput; res: ChapterRecord };
    [ipcChannels.chapterUpdate]: { req: ChapterUpdateInput; res: ChapterRecord };
    [ipcChannels.chapterList]: { req: ChapterListInput; res: ChapterRecord[] };
    [ipcChannels.chapterRead]: { req: ChapterReadInput; res: ChapterReadResponse };
    [ipcChannels.chapterDelete]: { req: ChapterDeleteInput; res: { id: string } };
    [ipcChannels.chapterReorder]: { req: ChapterReorderInput; res: ChapterRecord[] };
    [ipcChannels.chapterImportMd]: { req: ChapterImportMdInput; res: ChapterRecord };
    [ipcChannels.chapterExportMd]: { req: ChapterExportMdInput; res: ChapterExportMdResponse };
    [ipcChannels.chapterAutosaveWrite]: {
      req: ChapterAutosaveWriteInput;
      res: { savedAt: number };
    };
    [ipcChannels.chapterAutosavePeek]: {
      req: ChapterAutosavePeekInput;
      res: ChapterAutosavePeekResponse;
    };
    [ipcChannels.chapterAutosaveClear]: {
      req: ChapterAutosaveClearInput;
      res: { ok: true };
    };
    [ipcChannels.providerSave]: { req: ProviderSaveInput; res: ProviderRecord };
    [ipcChannels.providerList]: { req: void; res: ProviderRecord[] };
    [ipcChannels.providerDelete]: { req: ProviderDeleteInput; res: { id: string } };
    [ipcChannels.providerTest]: { req: ProviderTestInput; res: ProviderTestResponse };
    [ipcChannels.llmAnalyze]: { req: LLMAnalyzeInput; res: LLMAnalyzeResponse };
    [ipcChannels.llmQuick]: { req: LLMQuickActionInput; res: LLMQuickActionResponse };
    [ipcChannels.llmChat]: { req: LLMChatInput; res: LLMChatResponse };
    [ipcChannels.feedbackList]: { req: FeedbackListInput; res: AIFeedbackRecord[] };
    [ipcChannels.feedbackDismiss]: { req: FeedbackDismissInput; res: { id: string; dismissed: boolean } };
    [ipcChannels.feedbackDeleteEmpty]: { req: FeedbackDeleteEmptyInput; res: { deleted: number } };
    [ipcChannels.feedbackClearChapter]: { req: FeedbackClearChapterInput; res: { deleted: number } };
    [ipcChannels.outlineCreate]: { req: OutlineCreateInput; res: OutlineCardRecord };
    [ipcChannels.outlineUpdate]: { req: OutlineUpdateInput; res: OutlineCardRecord };
    [ipcChannels.outlineDelete]: { req: OutlineDeleteInput; res: { id: string } };
    [ipcChannels.outlineList]: { req: OutlineListInput; res: OutlineCardRecord[] };
    [ipcChannels.dailyProgress]: { req: DailyProgressInput; res: DailyProgressRecord };
    [ipcChannels.settingsGet]: { req: SettingsGetInput; res: AppSettings };
    [ipcChannels.settingsSet]: { req: SettingsSetInput; res: AppSettings };
    [ipcChannels.fsPickFile]: { req: FsPickFileInput; res: FsPickFileResponse };
    [ipcChannels.fsSaveFile]: { req: FsSaveFileInput; res: FsSaveFileResponse };
    [ipcChannels.terminalSpawn]: { req: TerminalSpawnInput; res: TerminalSpawnResponse };
    [ipcChannels.terminalInput]: { req: TerminalInputPayload; res: { ok: true } };
    [ipcChannels.terminalResize]: { req: TerminalResizePayload; res: { ok: true } };
    [ipcChannels.terminalDispose]: { req: TerminalDisposePayload; res: { ok: true } };
    [ipcChannels.skillCreate]: { req: SkillCreateInput; res: SkillDefinition };
    [ipcChannels.skillUpdate]: { req: SkillUpdateInput; res: SkillDefinition };
    [ipcChannels.skillGet]: { req: SkillGetInput; res: SkillDefinition | null };
    [ipcChannels.skillList]: { req: SkillListInput; res: SkillDefinition[] };
    [ipcChannels.skillDelete]: { req: SkillDeleteInput; res: { id: string } };
    [ipcChannels.skillRun]: { req: SkillRunInput; res: SkillRunResponse };
    [ipcChannels.skillImportJson]: { req: SkillImportJsonInput; res: SkillImportReport };
    [ipcChannels.skillExportJson]: { req: SkillExportJsonInput; res: SkillExportJsonResponse };
    [ipcChannels.tavernCardCreate]: { req: TavernCardCreateInput; res: TavernCardRecord };
    [ipcChannels.tavernCardUpdate]: { req: TavernCardUpdateInput; res: TavernCardRecord };
    [ipcChannels.tavernCardGet]: { req: TavernCardGetInput; res: TavernCardRecord | null };
    [ipcChannels.tavernCardList]: { req: TavernCardListInput; res: TavernCardRecord[] };
    [ipcChannels.tavernCardDelete]: { req: TavernCardDeleteInput; res: { id: string } };
    [ipcChannels.novelCharacterCreate]: { req: NovelCharacterCreateInput; res: NovelCharacterRecord };
    [ipcChannels.novelCharacterUpdate]: { req: NovelCharacterUpdateInput; res: NovelCharacterRecord };
    [ipcChannels.novelCharacterGet]: { req: NovelCharacterGetInput; res: NovelCharacterRecord | null };
    [ipcChannels.novelCharacterList]: { req: NovelCharacterListInput; res: NovelCharacterRecord[] };
    [ipcChannels.novelCharacterDelete]: { req: NovelCharacterDeleteInput; res: { id: string } };
    [ipcChannels.novelCharacterExtractFromChapter]: { req: NovelCharacterExtractInput; res: NovelCharacterExtractResponse };
    [ipcChannels.novelCharacterImportCandidates]: { req: NovelCharacterImportCandidatesInput; res: NovelCharacterImportCandidatesResponse };
    [ipcChannels.characterSyncPreview]: { req: CharacterSyncPreviewInput; res: CharacterSyncPreviewResponse };
    [ipcChannels.characterSyncApply]: { req: CharacterSyncApplyInput; res: CharacterSyncApplyResponse };
    [ipcChannels.characterSyncHistory]: { req: CharacterSyncHistoryInput; res: CharacterSyncLogRecord[] };
    [ipcChannels.tavernSessionCreate]: { req: TavernSessionCreateInput; res: TavernSessionRecord };
    [ipcChannels.tavernSessionGet]: { req: TavernSessionGetInput; res: TavernSessionRecord | null };
    [ipcChannels.tavernSessionList]: { req: TavernSessionListInput; res: TavernSessionRecord[] };
    [ipcChannels.tavernSessionDelete]: { req: TavernSessionDeleteInput; res: { sessionId: string } };
    [ipcChannels.tavernMessageList]: { req: TavernMessageListInput; res: TavernMessageRecord[] };
    [ipcChannels.tavernDirectorPost]: { req: TavernDirectorPostInput; res: TavernDirectorPostResponse };
    [ipcChannels.tavernRoundRun]: { req: TavernRoundRunInput; res: TavernRoundRunResponse };
    [ipcChannels.tavernRoundStop]: { req: TavernRoundStopInput; res: TavernRoundStopResponse };
    [ipcChannels.tavernSummaryCompact]: { req: TavernSummaryCompactInput; res: CompactResult };
    [ipcChannels.worldList]: { req: WorldListInput; res: WorldEntryRecord[] };
    [ipcChannels.worldGet]: { req: WorldGetInput; res: WorldEntryRecord | null };
    [ipcChannels.worldCreate]: { req: WorldCreateInput; res: WorldEntryRecord };
    [ipcChannels.worldUpdate]: { req: WorldUpdateInput; res: WorldEntryRecord };
    [ipcChannels.worldDelete]: { req: WorldDeleteInput; res: { id: string } };
    [ipcChannels.worldSearch]: { req: WorldSearchInput; res: WorldEntryRecord[] };
    [ipcChannels.researchSearch]: { req: ResearchSearchInput; res: ResearchSearchResponse };
    [ipcChannels.researchList]: { req: ResearchListInput; res: ResearchNoteRecord[] };
    [ipcChannels.researchGet]: { req: ResearchGetInput; res: ResearchNoteRecord | null };
    [ipcChannels.researchSave]: { req: ResearchSaveInput; res: ResearchNoteRecord };
    [ipcChannels.researchUpdate]: { req: ResearchUpdateInput; res: ResearchNoteRecord };
    [ipcChannels.researchDelete]: { req: ResearchDeleteInput; res: { id: string } };
    [ipcChannels.researchCredentialStatus]: {
      req: ResearchCredentialStatusInput;
      res: ResearchCredentialStatus[];
    };
    [ipcChannels.researchCredentialUpsert]: {
      req: ResearchCredentialUpsertInput;
      res: ResearchCredentialStatus;
    };
    [ipcChannels.researchCredentialDelete]: {
      req: ResearchCredentialDeleteInput;
      res: ResearchCredentialStatus;
    };
    [ipcChannels.reviewDimList]: { req: ReviewDimListInput; res: ReviewDimensionRecord[] };
    [ipcChannels.reviewDimUpsert]: { req: ReviewDimUpsertInput; res: ReviewDimensionRecord };
    [ipcChannels.reviewDimDelete]: { req: ReviewDimDeleteInput; res: { id: string } };
    [ipcChannels.reviewDimReorder]: {
      req: ReviewDimReorderInput;
      res: ReviewDimensionRecord[];
    };
    [ipcChannels.reviewRun]: { req: ReviewRunInput; res: ReviewRunResponse };
    [ipcChannels.reviewCancel]: { req: ReviewCancelInput; res: ReviewCancelResponse };
    [ipcChannels.reviewList]: { req: ReviewListInput; res: ReviewReportRecord[] };
    [ipcChannels.reviewGet]: { req: ReviewGetInput; res: ReviewGetResponse | null };
    [ipcChannels.reviewDismissFinding]: {
      req: ReviewDismissFindingInput;
      res: ReviewDismissFindingResponse;
    };
    [ipcChannels.reviewExport]: { req: ReviewExportInput; res: ReviewExportResponse };
    [ipcChannels.dailySummaryGenerate]: {
      req: DailySummaryGenerateInput;
      res: DailySummaryGenerateResponse;
    };
    [ipcChannels.dailySummaryGet]: {
      req: DailySummaryGetInput;
      res: DailySummaryRecord | null;
    };
    [ipcChannels.dailySummaryList]: {
      req: DailySummaryListInput;
      res: DailySummaryRecord[];
    };
    [ipcChannels.providerKeyList]: {
      req: ProviderKeyListInput;
      res: ProviderKeyRecord[];
    };
    [ipcChannels.providerKeyUpsert]: {
      req: ProviderKeyUpsertInput;
      res: ProviderKeyRecord;
    };
    [ipcChannels.providerKeyDelete]: {
      req: ProviderKeyDeleteInput;
      res: { id: string };
    };
    [ipcChannels.providerKeySetDisabled]: {
      req: ProviderKeySetDisabledInput;
      res: ProviderKeyRecord;
    };
    [ipcChannels.providerKeyHealth]: {
      req: ProviderKeyHealthInput;
      res: ProviderHealthSnapshot;
    };
    [ipcChannels.diagSnapshot]: { req: DiagSnapshotInput; res: DiagSnapshotResponse };
    [ipcChannels.diagCrashStatus]: { req: void; res: DiagCrashStatusResponse };
    [ipcChannels.diagCrashDismiss]: { req: void; res: { ok: true } };
    [ipcChannels.updateCheck]: { req: void; res: UpdateStatus };
    [ipcChannels.updateDownload]: { req: void; res: { ok: true } };
    [ipcChannels.updateInstall]: { req: void; res: { ok: true } };
    [ipcChannels.updateStatus]: { req: void; res: UpdateStatus };
    [ipcChannels.updateOpenDownloadPage]: { req: void; res: { ok: true } };
    [ipcChannels.marketFetchRegistry]: {
      req: MarketFetchRegistryInput;
      res: MarketRegistryDTO;
    };
    [ipcChannels.marketInstallSkill]: {
      req: MarketInstallSkillInput;
      res: MarketInstallSkillResponse;
    };
    [ipcChannels.marketBuildPublishBundle]: {
      req: MarketBuildPublishBundleInput;
      res: MarketBuildPublishBundleResponse;
    };
  }
}

declare module "./maps" {
  interface IpcEventMap {
    [ipcEventChannels.llmChunk]: LLMChunkEvent;
    [ipcEventChannels.llmDone]: LLMDoneEvent;
    [ipcEventChannels.terminalData]: TerminalDataEvent;
    [ipcEventChannels.terminalExit]: TerminalExitEvent;
    [ipcEventChannels.skillChunk]: SkillChunkEvent;
    [ipcEventChannels.skillDone]: SkillDoneEvent;
    [ipcEventChannels.tavernChunk]: TavernChunkEvent;
    [ipcEventChannels.tavernDone]: TavernDoneEvent;
    [ipcEventChannels.tavernBudgetWarning]: TavernBudgetWarningEvent;
    [ipcEventChannels.reviewProgress]: ReviewProgressEvent;
    [ipcEventChannels.reviewDone]: ReviewDoneEvent;
    [ipcEventChannels.dailySummaryChunk]: DailySummaryChunkEvent;
    [ipcEventChannels.dailySummaryDone]: DailySummaryDoneEvent;
    [ipcEventChannels.updateStatus]: UpdateStatus;
  }
}

