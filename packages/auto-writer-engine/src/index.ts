// 显式具名 re-export，避免 CJS 动态 __exportStar 导致 vite SSR
// 静态分析无法识别命名导出。

// ---- types ----
export type {
  SegmentState,
  AutoWriterStats,
  ChapterQualityFinding,
  ChapterFactCheckResult,
  AutoWriterReferenceTrace,
  AutoWriterRunReport,
  WritingConflictAnalysis,
  PlotCommitment,
  BookDiagnosisFinding,
  BookDiagnosisResult,
  BookRevisionTask,
  PipelineRunInput,
  AgentCallInput,
  AgentCallOutput,
  SnapshotHookInput,
  PipelineDeps,
  OocFinding,
  PhaseEmit,
  RoleResolver,
  StyleSampleRef,
} from "./types";
export { makeRoleResolver } from "./types";

// ---- agent-roles ----
export {
  AGENT_SYSTEM_PROMPTS,
  rosterToText,
  worldToText,
} from "./agent-roles";

// ---- context-merger ----
export type {
  BuildPlannerPromptInput,
  BuildWriterPromptInput,
  BuildCriticPromptInput,
  BuildReflectorPromptInput,
  BuildChapterFactCheckPromptInput,
  BuildWritingConflictPromptInput,
  BookDiagnosisChapterInput,
  BuildBookDiagnosisPromptInput,
} from "./context-merger";
export {
  buildPlannerSystem,
  buildPlannerUser,
  buildWriterSystem,
  buildWriterUser,
  buildCriticSystem,
  buildCriticUser,
  buildReflectorSystem,
  buildReflectorUser,
  buildChapterFactCheckSystem,
  buildChapterFactCheckUser,
  buildWritingConflictSystem,
  buildWritingConflictUser,
  buildBookDiagnosisSystem,
  buildBookDiagnosisUser,
} from "./context-merger";

// ---- ooc-gate ----
export {
  parseFindings,
  findingsToMarkdown,
  shouldRewriteFromFindings,
  summarizeFindings,
} from "./ooc-gate";

// ---- prompt constraints ----
export type {
  PromptConstraintSet,
  EvaluateSegmentConstraintsInput,
} from "./prompt-constraints";
export {
  extractPromptConstraints,
  mergePromptConstraints,
  hasPromptConstraints,
  getRequiredTermsForText,
  renderPromptConstraintBlock,
  evaluateSegmentConstraints,
} from "./prompt-constraints";

// ---- chapter quality ----
export {
  parseChapterFactCheck,
  summarizeChapterQuality,
  chapterQualityFindingsToMarkdown,
} from "./chapter-quality";

// ---- writing conflict ----
export { parseWritingConflictAnalysis } from "./writing-conflict";

// ---- plot commitments ----
export {
  extractPlotCommitments,
  extractPlotCommitmentsFromText,
  mergePlotCommitments,
  renderPlotCommitmentsBlock,
} from "./plot-commitments";

// ---- run report ----
export { renderAutoWriterRunReportMarkdown } from "./auto-writer-report";

// ---- book diagnosis ----
export { parseBookDiagnosis } from "./book-diagnosis";

// ---- user-interrupt-queue ----
export { UserInterruptQueue } from "./user-interrupt-queue";

// ---- chapter draft helpers ----
export {
  countNonWhitespaceGraphemes,
  prepareGeneratedChapterDraft,
  removeConsecutiveDuplicateMarkdownHeadings,
  tailText,
} from "./chapter-draft";
export type { PreparedGeneratedChapterDraft } from "./chapter-draft";

// ---- pipeline orchestrator ----
export { runAutoWriterPipeline, normalizeNovelParagraphs } from "./pipeline-orchestrator";
