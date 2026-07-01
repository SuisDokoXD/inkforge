import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AIFeedbackRecord,
  AppSettings,
  ChapterRecord,
  ProjectRecord,
  ResearchProvider,
  ResearchSearchHit,
  SyncDiffRow,
  TokenBudgetState,
} from "@inkforge/shared";

export type SplitMode = null | "2col" | "3col";  // A7: 分屏编辑模式

export type MainView =
  | "writing"
  | "skill"
  | "character"
  | "tavern"
  | "world"
  | "research"
  | "review"
  | "bookshelf"
  | "achievement"
  | "letters"
  | "outline"
  | "auto-writer"
  | "materials"
  | "stats"  // C4: 写作统计仪表盘
  | "timeline";  // C12: 时间线可视化

// A9: 每页上次活跃实体的 ID（用于视图切换后恢复上下文）。
// writing 页不在此列——它有自己的 currentChapterId。
export type PageActiveIds = Partial<Record<Exclude<MainView, "writing">, string>>;

export interface StreamingAnalysis {
  analysisId: string;
  projectId: string;
  chapterId: string;
  providerId: string;
  status: "streaming" | "completed" | "failed";
  accumulatedText: string;
  error?: string;
  feedback?: AIFeedbackRecord;
  startedAt: string;
  finishedAt?: string;
}

export interface ChapterLiveStats {
  cjk: number;
  en: number;
  tokens: number;
  graphemes: number;
}

/**
 * v22+: AutoWriter 用户上次选择的配置——持久化到 localStorage 后下次自动回填，
 * 避免反复设 provider/model/段长。bindings 也存。
 */
export interface AutoWriterRemembered {
  primaryProviderId: string;
  primaryModel: string;
  agentBindings: Partial<Record<string, { providerId: string; model: string }>>;
  targetSegmentLength: number;
  maxSegments: number;
  maxRewrites: number;
  enableOocGate: boolean;
  speedMode?: "fast" | "quality";
  advanced: boolean;
  sampleLibIds?: string[];
}

/**
 * 资料检索搜索结果 —— 从 ResearchPage useState 上提到 store，跨视图切换保持。
 */
export interface ResearchSearchState {
  topic: string;
  hits: ResearchSearchHit[];
  usedProvider: ResearchProvider | null;
  fellBackToLlm: boolean;
  error?: string;
  expandedQueries?: string[];
  attemptedProviders?: ResearchProvider[];
  queriedAt: string; // ISO timestamp
}

export interface AppState {
  currentProjectId: string | null;
  currentChapterId: string | null;
  // A7: 多标签+分屏编辑
  openEditorTabs: string[];
  activeTabIndex: number;
  splitMode: SplitMode;

  settings: AppSettings;
  settingsLoaded: boolean;
  settingsPanelOpen: boolean;
  providerPanelOpen: boolean;
  mainView: MainView;
  outlineFocusCardId: string | null;
  researchDraftQuery: string | null;
  researchSearchState: ResearchSearchState | null;
  researchSearchHistory: ResearchSearchState[];
  rightPanel: "timeline" | "chat";
  terminalOpen: boolean;
  terminalHeight: number;
  analyses: StreamingAnalysis[];
  activeSkillId: string | null;
  skillEditorDirty: boolean;
  
  // Character & Tavern
  activeNovelCharacterId: string | null;
  activeTavernCardId: string | null;
  syncDiffData: { previewData: SyncDiffRow[]; novelCharId: string; tavernCardId: string } | null;
  activeTavernSessionId: string | null;
  tavernBudgetState: Record<string, TokenBudgetState>;
  tavernStreamBuffers: Record<string, { roundId: string; speakerCardId: string; speakerName: string; text: string }>;

  // World
  activeWorldCategory: string | null;
  activeWorldEntryId: string | null;
  worldSearchQuery: string;

  // Editor live stats (for StatusBar three-column display)
  currentChapterStats: ChapterLiveStats | null;

  // AutoWriter remembered config (v22+)
  autoWriterConfig: AutoWriterRemembered | null;

  setProject: (projectId: string | null) => void;
  setChapter: (chapterId: string | null) => void;
  setSettings: (settings: AppSettings) => void;
  // A7: 多标签+分屏操作
  setChapterInTab: (chapterId: string) => void;
  openInTab: (chapterId: string) => void;
  closeTab: (index: number) => void;
  setActiveTabIndex: (index: number) => void;
  setSplitMode: (mode: SplitMode) => void;

  patchSettings: (updates: Partial<AppSettings>) => void;
  openSettings: (open?: boolean) => void;
  openProviderPanel: (open?: boolean) => void;
  setMainView: (view: MainView) => void;
  // A1: 视图切换前兜底落盘——EditorPane 注册自己的 flush 函数，
  // setMainView 离开 writing 前先同步触发，确保不丢字。
  registerBeforeLeaveView: (fn: (() => void) | null) => void;
  setOutlineFocusCard: (cardId: string | null) => void;
  setResearchDraftQuery: (query: string | null) => void;
  setResearchSearchState: (state: ResearchSearchState | null) => void;
  clearResearchSearchHistory: () => void;
  setRightPanel: (panel: "timeline" | "chat") => void;
  toggleTerminal: (open?: boolean) => void;
  setTerminalHeight: (h: number) => void;
  upsertStreaming: (analysis: StreamingAnalysis) => void;
  finishAnalysis: (
    analysisId: string,
    status: "completed" | "failed",
    patch: Partial<StreamingAnalysis>,
  ) => void;
  clearAnalysesForChapter: (chapterId: string) => void;
  setActiveSkillId: (id: string | null) => void;
  setSkillEditorDirty: (dirty: boolean) => void;
  
  // Character & Tavern
  setActiveNovelCharacterId: (id: string | null) => void;
  setActiveTavernCardId: (id: string | null) => void;
  setSyncDiffData: (data: { previewData: SyncDiffRow[]; novelCharId: string; tavernCardId: string } | null) => void;
  setActiveTavernSessionId: (id: string | null) => void;
  setTavernBudgetState: (sessionId: string, state: TokenBudgetState) => void;
  updateTavernStreamBuffer: (
    sessionId: string,
    patch: { roundId: string; speakerCardId: string; speakerName: string; text: string } | null,
  ) => void;

  // World
  setActiveWorldCategory: (category: string | null) => void;
  setActiveWorldEntryId: (id: string | null) => void;
  setWorldSearchQuery: (query: string) => void;

  // Editor live stats
  setCurrentChapterStats: (stats: ChapterLiveStats | null) => void;

  // A2: Review→Editor 跳转——存原文字符串，EditorPane 检测到后自动滚动到对应位置
  reviewJumpExcerpt: string | null;
  setReviewJumpExcerpt: (text: string | null) => void;

  // A9: 视图上下文保留——每个非写作页上次选中实体的 ID
  lastActivePerPage: PageActiveIds;
  setPageActiveId: (view: Exclude<MainView, "writing">, id: string | null) => void;

  // AutoWriter
  setAutoWriterConfig: (cfg: AutoWriterRemembered | null) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  activeProviderId: null,
  analysisEnabled: true,
  analysisThreshold: 200,
  uiLanguage: "zh",
  devModeEnabled: false,
  onboardingCompleted: false,
  sceneRoutingMode: "basic",
  editorFontSize: 16,
  editorLineHeight: 1.8, // B2: 中文排版最佳行高（原 2.0 偏松）
  editorWidth: "medium",
  typewriterMode: false,
  autoIndent: true,
  spellcheck: true,
  focusMode: false,
  // C9: 自定义强调色（#RRGGBB 或 null 用主题默认）
  customAccent: null,
};

// A1: 视图切换前同步落盘钩子。EditorPane 在挂载时注册自己的 flush 函数，
// setMainView 在改变视图前先调用它，避免异步 cleanup 来不及完成。
const beforeLeaveViewRef: { current: (() => void) | null } = { current: null };

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      currentChapterId: null,
      // A7: 多标签+分屏编辑
      openEditorTabs: [] as string[],
      activeTabIndex: 0,
      splitMode: null as SplitMode,
      settings: DEFAULT_SETTINGS,
      settingsLoaded: false,
      settingsPanelOpen: false,
      providerPanelOpen: false,
      mainView: "writing",
      outlineFocusCardId: null,
      researchDraftQuery: null,
      researchSearchState: null,
      researchSearchHistory: [],
      rightPanel: "timeline",
      terminalOpen: false,
      terminalHeight: 240,
      analyses: [],
      activeSkillId: null,
      skillEditorDirty: false,

      activeNovelCharacterId: null,
      activeTavernCardId: null,
      syncDiffData: null,
      activeTavernSessionId: null,
      tavernBudgetState: {},
      tavernStreamBuffers: {},

      activeWorldCategory: null,
      activeWorldEntryId: null,
      worldSearchQuery: "",

      currentChapterStats: null,

      // A2: Review→Editor 跳转用摘录文本
      reviewJumpExcerpt: null,

      // A9: 视图上下文保留
      lastActivePerPage: {},

      autoWriterConfig: null,

      setProject: (projectId) =>
        set(() => ({
          currentProjectId: projectId,
          currentChapterId: null,
          analyses: [],
        })),
      setChapter: (chapterId) =>
        set((s) => {
          if (!chapterId) return { currentChapterId: null, openEditorTabs: [], activeTabIndex: 0 };
          const idx = s.openEditorTabs.indexOf(chapterId);
          return {
            currentChapterId: chapterId,
            openEditorTabs: idx >= 0 ? s.openEditorTabs : [chapterId],
            activeTabIndex: idx >= 0 ? idx : 0,
          };
        }),
      setSettings: (settings) => set(() => ({ settings, settingsLoaded: true })),
      patchSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
      openSettings: (open = true) => set(() => ({ settingsPanelOpen: open })),
      openProviderPanel: (open = true) => set(() => ({ providerPanelOpen: open })),
      setMainView: (view) => {
        // A1: 离开写作页前，先同步触发 EditorPane 的落盘钩子，
        // 确保最后一个按键的内容不会因异步 cleanup 未完成而丢失。
        if (view !== "writing" && beforeLeaveViewRef.current) {
          beforeLeaveViewRef.current();
        }
        set(() => ({ mainView: view }));
      },
      registerBeforeLeaveView: (fn) => {
        beforeLeaveViewRef.current = fn;
      },
      // A7: 多标签+分屏 setter
      setChapterInTab: (chapterId) =>
        set((s) => {
          const idx = s.openEditorTabs.indexOf(chapterId);
          return {
            currentChapterId: chapterId,
            openEditorTabs: idx >= 0 ? s.openEditorTabs : [chapterId],
            activeTabIndex: idx >= 0 ? idx : 0,
          };
        }),
      openInTab: (chapterId) =>
        set((s) => {
          if (s.openEditorTabs.includes(chapterId)) {
            return { activeTabIndex: s.openEditorTabs.indexOf(chapterId) };
          }
          return {
            openEditorTabs: [...s.openEditorTabs, chapterId],
            activeTabIndex: s.openEditorTabs.length,
          };
        }),
      closeTab: (index) =>
        set((s) => {
          if (s.openEditorTabs.length <= 1) return {};
          const next = s.openEditorTabs.filter((_2, i) => i !== index);
          const newIdx = Math.min(s.activeTabIndex, next.length - 1);
          const newSplit = (
            s.splitMode === "3col" && next.length < 3 ? "2col" :
            s.splitMode === "2col" && next.length < 2 ? null :
            s.splitMode
          ) as SplitMode;
          return {
            openEditorTabs: next,
            activeTabIndex: newIdx,
            currentChapterId: next[newIdx] ?? s.currentChapterId,
            splitMode: newSplit,
          };
        }),
      setActiveTabIndex: (index) =>
        set((s) => ({
          activeTabIndex: index,
          currentChapterId: s.openEditorTabs[index] ?? s.currentChapterId,
        })),
      setSplitMode: (mode) => set(() => ({ splitMode: mode })),
      setOutlineFocusCard: (cardId) =>
        set((s) => ({
          outlineFocusCardId: cardId,
          lastActivePerPage: cardId
            ? { ...s.lastActivePerPage, outline: cardId }
            : s.lastActivePerPage,
        })),
      setResearchDraftQuery: (query) => set(() => ({ researchDraftQuery: query })),
      setResearchSearchState: (state) =>
        set((s) => {
          if (!state) return { researchSearchState: null };
          // 同名查询替换旧条目，避免历史记录膨胀
          // 空结果不进入历史记录
          const filtered = state.hits.length === 0
            ? s.researchSearchHistory
            : s.researchSearchHistory.filter(
                (entry) => entry.topic !== state.topic,
              );
          const history = state.hits.length === 0
            ? filtered
            : [state, ...filtered].slice(0, 30);
          return { researchSearchState: state, researchSearchHistory: history };
        }),
      clearResearchSearchHistory: () =>
        set(() => ({ researchSearchHistory: [], researchSearchState: null })),
      setRightPanel: (panel) => set(() => ({ rightPanel: panel })),
      toggleTerminal: (open) =>
        set((state) => ({ terminalOpen: typeof open === "boolean" ? open : !state.terminalOpen })),
      setTerminalHeight: (h) =>
        set(() => ({ terminalHeight: Math.max(120, Math.min(700, Math.round(h))) })),
      upsertStreaming: (analysis) =>
        set((state) => {
          const next = state.analyses.filter((a) => a.analysisId !== analysis.analysisId);
          next.unshift(analysis);
          return { analyses: next.slice(0, 50) };
        }),
      finishAnalysis: (analysisId, status, patch) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.analysisId === analysisId
              ? {
                  ...a,
                  ...patch,
                  status,
                  finishedAt: new Date().toISOString(),
                }
              : a,
          ),
        })),
      clearAnalysesForChapter: (chapterId) =>
        set((state) => ({
          analyses: state.analyses.filter((a) => a.chapterId !== chapterId),
        })),
      setActiveSkillId: (id) =>
        set((s) => ({
          activeSkillId: id,
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, skill: id }
            : s.lastActivePerPage,
        })),
      setSkillEditorDirty: (dirty) => set(() => ({ skillEditorDirty: dirty })),

      setActiveNovelCharacterId: (id) =>
        set((s) => ({
          activeNovelCharacterId: id,
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, character: id }
            : s.lastActivePerPage,
        })),
      setActiveTavernCardId: (id) =>
        set((s) => ({
          activeTavernCardId: id,
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, tavern: id }
            : s.lastActivePerPage,
        })),
      setSyncDiffData: (data) => set(() => ({ syncDiffData: data })),
      setActiveTavernSessionId: (id) =>
        set((s) => ({
          activeTavernSessionId: id,
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, tavern: id }
            : s.lastActivePerPage,
        })),
      setTavernBudgetState: (sessionId, state) =>
        set((s) => ({ tavernBudgetState: { ...s.tavernBudgetState, [sessionId]: state } })),
      updateTavernStreamBuffer: (sessionId, patch) =>
        set((s) => {
          const newBuffers = { ...s.tavernStreamBuffers };
          if (patch === null) {
            // Clear buffer
            delete newBuffers[sessionId];
          } else {
            newBuffers[sessionId] = patch;
          }
          return { tavernStreamBuffers: newBuffers };
        }),

      setActiveWorldCategory: (category) =>
        set((s) => ({
          activeWorldCategory: category,
          lastActivePerPage: category
            ? { ...s.lastActivePerPage, world: category }
            : s.lastActivePerPage,
        })),
      setActiveWorldEntryId: (id) =>
        set((s) => ({
          activeWorldEntryId: id,
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, world: id }
            : s.lastActivePerPage,
        })),
      setWorldSearchQuery: (query) => set(() => ({ worldSearchQuery: query })),

      // A9: 通用"页→上次选中 ID"记录器。页面组件在选中实体时调用，
      // 切回该页后可从此恢复上下文。
      setPageActiveId: (view, id) =>
        set((s) => ({
          lastActivePerPage: id
            ? { ...s.lastActivePerPage, [view]: id }
            : (() => {
                const next = { ...s.lastActivePerPage };
                delete next[view];
                return next;
              })(),
        })),

      setCurrentChapterStats: (stats) => set(() => ({ currentChapterStats: stats })),

      // A2: Review→Editor 跳转——ReviewPage 设置摘录文本，
      // EditorPane 检测后调用 jumpEditorToText 滚动定位。
      setReviewJumpExcerpt: (text) => set(() => ({ reviewJumpExcerpt: text })),

      setAutoWriterConfig: (cfg) => set(() => ({ autoWriterConfig: cfg })),
    }),
    {
      // v22+: 把"上次打开的书 / 章节 / 视图"持久化到 localStorage，
      // 避免重启后 currentProjectId=null，导致项目隔离的素材库（sample_libs.project_id 过滤）看起来"消失"。
      name: "inkforge-app-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        currentChapterId: state.currentChapterId,
        mainView: state.mainView,
        rightPanel: state.rightPanel,
        terminalHeight: state.terminalHeight,
        autoWriterConfig: state.autoWriterConfig,
        // A7: 恢复上次打开的标签页
        openEditorTabs: state.openEditorTabs,
        activeTabIndex: state.activeTabIndex,
      }),
    },
  ),
);

export type { ProjectRecord, ChapterRecord };
