import type {
  AutoWriterAgentBinding,
  AutoWriterAgentRole,
  AutoWriterCorrectionEntry,
  AutoWriterPhase,
  ChapterSnapshotRecord,
  NovelCharacterRecord,
  WorldEntryRecord,
} from "@inkforge/shared";

/** 单段输出的状态记录。 */
export interface SegmentState {
  index: number;
  beat: string;
  /** 当前累积的正文文本。 */
  text: string;
  /** 本段已经被回炉重写的次数。 */
  rewriteCount: number;
  /** 上一轮 Critic 输出的 findings 摘要（中文 markdown，喂回 Writer）。 */
  lastCriticFindingsText: string | null;
  status: "pending" | "writing" | "criticking" | "reflecting" | "completed" | "failed";
}

export interface AutoWriterStats {
  totalSegments: number;
  totalRewrites: number;
  totalTokensIn: number;
  totalTokensOut: number;
  startedAt: string;
  finishedAt?: string;
}

export interface PipelineRunInput {
  runId: string;
  projectId: string;
  chapterId: string;
  /** 用户初始思路 */
  userIdeas: string;
  /** 4 个角色的 binding；可只传 1 条 role='writer' 表示统一模型 */
  agents: AutoWriterAgentBinding[];
  /** 单段长度目标（字数） */
  targetSegmentLength: number;
  /** 段数上限 */
  maxSegments: number;
  /** 单段最多重写次数 */
  maxRewritesPerSegment: number;
  /** 是否启用 OOC 守门员 */
  enableOocGate: boolean;
  /** fast skips per-segment critic / reflector / rewrites for long-form speed. */
  speedMode?: "fast" | "quality";
  /** 已存在的章节正文（用户已写部分）做续写起点 */
  existingChapterText: string;
  /** 章节标题，喂给 Planner 提示 */
  chapterTitle: string;
  /** 项目人物档案（OOC 检查用） */
  characters: NovelCharacterRecord[];
  /** 世界观条目（OOC 检查用） */
  worldEntries: WorldEntryRecord[];
  // ----- v20: 新增上下文（cross-chapter / global worldview / sample style） -----
  /** 全书层面的世界观大纲（纯文本），来自 projects.global_worldview。 */
  globalWorldview?: string;
  /** 前情提要：上 N 章摘要 / 原文片段。 */
  previousChaptersText?: string;
  /** 文风参考样本（来自 sample_libs / 用户手动选定）。 */
  styleSamples?: StyleSampleRef[];
  /** 写作声音档案渲染出的风格约束。 */
  voiceBlock?: string;
}

export interface StyleSampleRef {
  source: string;
  excerpt: string;
}

export interface AgentCallInput {
  role: AutoWriterAgentRole;
  binding: AutoWriterAgentBinding;
  systemPrompt: string;
  userPrompt: string;
}

export interface AgentCallOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface SnapshotHookInput {
  kind: "pre-ai" | "post-ai" | "pre-rewrite";
  segmentIndex: number;
  agentRole: AutoWriterAgentRole;
  /** 当前章节完整正文（用于打快照） */
  chapterText: string;
}

export interface PipelineDeps {
  /**
   * 调用某个 agent 一次（非流式语义；具体的 streaming chunk 转发由调用方在内部处理）。
   * 回调里转发 onChunk 即可让 UI 实时渲染。
   */
  invokeAgent: (
    input: AgentCallInput,
    onDelta: (chunk: { delta: string; accumulated: string }) => void,
  ) => Promise<AgentCallOutput>;

  /** 创建快照（chapter 当前内容 + 元数据）。 */
  createSnapshot: (input: SnapshotHookInput) => Promise<ChapterSnapshotRecord | null>;

  /** 用最新的章节正文覆盖章节文件 + DB 行。engine 自己维护内容拼装。 */
  applyChapterContent: (input: {
    chapterText: string;
    /** 提示当前段索引，便于上层做 hint。 */
    segmentIndex: number;
  }) => Promise<void>;

  /** OOC 守门员：返回 findings（结构化）。空数组表示通过。 */
  runOocGate: (input: {
    chapterTitle: string;
    segmentText: string;
    characters: NovelCharacterRecord[];
    worldEntries: WorldEntryRecord[];
  }) => Promise<OocFinding[]>;

  /** 取出排队中的用户介入消息；空数组表示无追加思路。 */
  drainInterrupts: () => AutoWriterCorrectionEntry[];

  /** Phase 切换通知。 */
  emitPhase: (event: PhaseEmit) => void;

  /** 是否已被外部 stop。 */
  isCancelled: () => boolean;

  /** 是否已被外部 pause。 */
  isPaused: () => boolean;
}

export interface OocFinding {
  severity: "info" | "warn" | "error";
  excerpt: string;
  suggestion: string;
  /** v20: Critic 给出的本段总体评分 0-10。可选（旧 LLM 不返回时省略）。 */
  score?: number;
}

export interface PhaseEmit {
  phase: AutoWriterPhase;
  segmentIndex: number;
  rewriteCount?: number;
  criticSummary?: { errorCount: number; warnCount: number; infoCount: number };
}

export type RoleResolver = (role: AutoWriterAgentRole) => AutoWriterAgentBinding;

/** 把 agents 数组规范化为 4 角色查询函数。 */
export function makeRoleResolver(agents: AutoWriterAgentBinding[]): RoleResolver {
  const map = new Map<AutoWriterAgentRole, AutoWriterAgentBinding>();
  for (const a of agents) map.set(a.role, a);
  // 默认统一模型：以 'writer' 为 fallback
  const fallback =
    map.get("writer") ??
    map.get("planner") ??
    agents[0] ??
    null;
  return (role) => {
    const found = map.get(role);
    if (found) return found;
    if (!fallback) {
      throw new Error("auto-writer: no agent binding configured");
    }
    return { ...fallback, role };
  };
}
