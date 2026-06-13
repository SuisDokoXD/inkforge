// 显式具名 re-export，避免 CJS 动态 __exportStar 导致 vite SSR
// 静态分析无法识别命名导出。

// ---- types ----
export type {
  SegmentState,
  AutoWriterStats,
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
} from "./context-merger";

// ---- ooc-gate ----
export {
  parseFindings,
  findingsToMarkdown,
  shouldRewriteFromFindings,
  summarizeFindings,
} from "./ooc-gate";

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
