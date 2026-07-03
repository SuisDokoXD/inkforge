import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  AppSettings,
  ChapterRecord,
  ChapterReadResponse,
  OutlineCardRecord,
  ProviderRecord,
  SkillDefinition,
  SkillOutputTarget,
  SnapshotRestoreResponse,
} from "@inkforge/shared";
import { computeWordStats } from "@inkforge/shared";
import {
  NovelEditor,
  countGraphemes,
  computeWordCount,
  findTextMatches,
  normalizeManualSelection,
  plainTextToEditorHtml,
  useAnalysisTrigger,
  type TextFindOptions,
} from "@inkforge/editor";
import type { Editor } from "@tiptap/react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Download,
  Focus,
  PenLine,
  Puzzle,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { chapterApi, fsApi, llmApi, outlineApi, settingsApi, skillApi, snapshotApi } from "../lib/api";
import { applySkillOutputToEditor } from "../lib/skill-output";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { extractChapterHeadings } from "../lib/chapter-headings";
import { extractManualChapterMap, type ManualChapterMapItem } from "../lib/manual-chapter-map";
import { DUR, EASE_IN_OUT, EASE_STANDARD, fadeOnly } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import { useDebouncedValue } from "../lib/use-debounced-value";
import {
  MANUAL_RHYTHM_ACTIVE_WINDOW_MS,
  buildManualWritingResumeCue,
  createDefaultManualWritingRhythmState,
  manualWritingRhythmStorageKey,
  normalizeNextBeat,
  normalizeRhythmSnippet,
  parseManualWritingRhythmState,
  serializeManualWritingRhythmState,
  type ManualWritingRhythmState,
} from "../lib/manual-writing-rhythm";
import { SelectionToolbar } from "./SelectionToolbar";
import { InspirationBubble } from "./InspirationBubble";
import { ChapterFromOutlineDialog } from "./ChapterFromOutlineDialog";
import { EmptyState } from "./EmptyState";
import { SnapshotMenu } from "./snapshot";
import { ChapterWorkflowBar } from "./editor/ChapterWorkflowBar";
import { ManualChapterMapMenu } from "./editor/ManualChapterMapMenu";
import { ManualWritingRhythmBar } from "./editor/ManualWritingRhythmBar";
import { EditorFindBar } from "./editor/EditorFindBar";
import { FocusDraftBoard } from "./editor/FocusDraftBoard";
import { EditorAppearanceMenu } from "./editor/EditorAppearanceMenu";
import { EditorInsertMenu } from "./editor/EditorInsertMenu";
import { RecoveryPromptBanner } from "./editor/RecoveryPromptBanner";
import { ReadAloud } from "./ReadAloud";  // C7: TTS 朗读
import { IconButton, Divider } from "./ui";

interface EditorPaneProps {
  chapter: ChapterRecord | null;
  headingJumpTarget?: {
    chapterId: string;
    id: string;
    title: string;
    line: number;
    nonce: number;
  } | null;
  providers: ProviderRecord[];
  // 无选中章节时的空状态引导：把"新建章节"动作交给空状态的主 CTA，
  // 让原本只有一行灰字的空旷编辑区变成有指引、有落点的画面。
  onCreateChapter?: () => void;
  creatingChapter?: boolean;
}

type SavePhase = "saved" | "queued" | "saving" | "error";
type StatusTone = "neutral" | "busy" | "success" | "error";

interface EditorTransientStatus {
  kind: Exclude<StatusTone, "neutral">;
  text: string;
}

interface SaveRequest {
  chapterId: string;
  projectId: string;
  content: string;
  wordCount: number;
}

interface EditorFindMatch {
  from: number;
  to: number;
  text: string;
}

interface EditorCursorState {
  lineNumber: number;
  paragraphGraphemes: number;
  selectedGraphemes: number;
}

interface StoredEditorPosition {
  pos: number;
  scrollTop: number;
  updatedAt: string;
  savedAt: number;
}

type EditorCommandDetail =
  | { action: "insert-heading"; level: 1 | 2 }
  | { action: "insert-scene-break" }
  | { action: "insert-indent" }
  | { action: "insert-todo" }
  | { action: "jump-heading"; direction: "previous" | "next" };

interface SaveStatusIndicatorProps {
  phase: SavePhase;
  label: string;
  className: string;
  title: string;
  tone?: StatusTone;
  reduceMotion: boolean;
}

function SaveStatusIndicator({
  phase,
  label,
  className,
  title,
  tone,
  reduceMotion,
}: SaveStatusIndicatorProps): JSX.Element {
  const resolvedTone =
    tone ??
    (phase === "error"
      ? "error"
      : phase === "saving" || phase === "queued"
        ? "busy"
        : "neutral");
  const dotClass =
    resolvedTone === "error"
      ? "bg-red-300 shadow-[0_0_10px_rgba(252,165,165,0.45)]"
      : resolvedTone === "success"
        ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.4)]"
      : resolvedTone === "busy"
        ? "bg-accent-300 shadow-[0_0_10px_rgba(125,211,252,0.45)]"
        : "bg-ink-500";
  const isBusy = resolvedTone === "busy";

  return (
    <span
      className={`inline-flex max-w-56 items-center gap-1.5 overflow-hidden ${className}`}
      title={title}
      role={resolvedTone === "error" ? "alert" : "status"}
      aria-live={resolvedTone === "error" ? "assertive" : "polite"}
    >
      <motion.span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
        animate={
          !reduceMotion && isBusy
            ? { opacity: [0.55, 1, 0.55], scale: [1, 1.35, 1] }
            : { opacity: 1, scale: 1 }
        }
        transition={
          !reduceMotion && isBusy
            ? { duration: 0.9, ease: EASE_IN_OUT, repeat: Infinity }
            : { duration: DUR.fast, ease: EASE_STANDARD }
        }
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={`${phase}:${label}`}
          className="truncate"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: DUR.fast, ease: EASE_STANDARD }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const DEFAULT_CURSOR_STATE: EditorCursorState = {
  lineNumber: 1,
  paragraphGraphemes: 0,
  selectedGraphemes: 0,
};

function editorPositionStorageKey(projectId: string, chapterId: string): string {
  return `inkforge:editor-position:${projectId}:${chapterId}`;
}

function getEditorScrollElement(editor: Editor): HTMLElement | null {
  return editor.view.dom.closest(".overflow-auto,.scrollbar-thin") as HTMLElement | null;
}

function clampEditorPosition(editor: Editor, pos: number): number {
  return Math.max(1, Math.min(pos, Math.max(1, editor.state.doc.content.size)));
}

function readStoredEditorPosition(raw: string | null): StoredEditorPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEditorPosition>;
    if (
      typeof parsed.pos === "number" &&
      typeof parsed.scrollTop === "number" &&
      typeof parsed.savedAt === "number"
    ) {
      return {
        pos: parsed.pos,
        scrollTop: parsed.scrollTop,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        savedAt: parsed.savedAt,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function readEditorCursorState(editor: Editor): EditorCursorState {
  const { state } = editor;
  const { selection } = state;
  const lineText = state.doc.textBetween(0, selection.from, "\n", "\n");
  const selectedText = selection.empty ? "" : state.doc.textBetween(selection.from, selection.to, "\n", "\n");
  return {
    lineNumber: lineText.split(/\r?\n/).length,
    paragraphGraphemes: computeWordCount(selection.$from.parent.textContent).graphemes,
    selectedGraphemes: computeWordCount(selectedText).graphemes,
  };
}

function readManualRhythmCue(content: string, lineNumber: number): { line: number; text: string } {
  const lines = content.split(/\r?\n/);
  const safeLine = Math.max(1, Math.min(lines.length || 1, Math.round(lineNumber) || 1));
  const currentLineText = normalizeRhythmSnippet(lines[safeLine - 1] ?? "");
  if (currentLineText) return { line: safeLine, text: currentLineText };
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const text = normalizeRhythmSnippet(lines[index] ?? "");
    if (text) return { line: index + 1, text };
  }
  return { line: safeLine, text: "" };
}
export function EditorPane({
  chapter,
  headingJumpTarget,
  providers,
  onCreateChapter,
  creatingChapter,
}: EditorPaneProps): JSX.Element {
  const queryClient = useQueryClient();
  const settings = useAppStore((s) => s.settings);
  const activeProviderId = settings.activeProviderId;
  const analysisEnabled = settings.analysisEnabled;
  const analysisThreshold = settings.analysisThreshold;
  const flowActions = useWritingFlowActions();
  const reduceMotion = useReducedMotion();
  const shouldReduceMotion = reduceMotion === true;

  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const { status: exportStatus, showStatus: showExportStatus } = useTimedStatus<EditorTransientStatus>();
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const { status: skillStatus, showStatus: showSkillStatus } = useTimedStatus<EditorTransientStatus>();
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false);
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findOptions, setFindOptions] = useState<TextFindOptions>({
    caseSensitive: false,
    wholeWord: false,
  });
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [cursorState, setCursorState] = useState<EditorCursorState>(DEFAULT_CURSOR_STATE);
  const [rhythmState, setRhythmState] = useState<ManualWritingRhythmState>(() =>
    createDefaultManualWritingRhythmState(),
  );
  const [sessionBaseGraphemes, setSessionBaseGraphemes] = useState(0);
  const [activeWritingMs, setActiveWritingMs] = useState(0);
  const [rhythmNow, setRhythmNow] = useState(() => Date.now());
  // A8: skill 写入编辑器后的段落高亮——存被修改的文本范围，3s 后自动清除。
  const [skillHighlightKey, setSkillHighlightKey] = useState<number>(0);
  const [savePhase, setSavePhase] = useState<SavePhase>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveStatusNow, setSaveStatusNow] = useState(() => Date.now());
  const [recoveryPrompt, setRecoveryPrompt] = useState<
    { content: string; savedAt: number } | null
  >(null);
  const contentRef = useRef<string>("");
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const lastSavedRef = useRef<string>("");
  const lastAutosavedRef = useRef<string>("");
  const loadedChapterIdRef = useRef<string | null>(null);
  const activeAnalysisChapterRef = useRef<string | null>(null);
  const skillMenuRef = useRef<HTMLDivElement | null>(null);
  const snapshotMenuRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const saveQueueRef = useRef<SaveRequest | null>(null);
  const saveLoopPromiseRef = useRef<Promise<void> | null>(null);
  const activeSkillRunRef = useRef<{ runId: string; skillName: string; output: SkillOutputTarget } | null>(null);
  const lastHeadingJumpNonceRef = useRef<number | null>(null);
  const dailyProgressInvalidatedAtRef = useRef<Map<string, number>>(new Map());
  const positionSaveFrameRef = useRef<number | null>(null);
  const lastRestoredPositionChapterRef = useRef<string | null>(null);
  const rhythmLoadedChapterIdRef = useRef<string | null>(null);
  const previousContentForRhythmRef = useRef<string>("");
  const lastWritingTickRef = useRef<number | null>(null);
  const setEditorContent = useCallback((nextContent: string, chapterId?: string | null) => {
    contentRef.current = nextContent;
    if (chapterId) {
      contentCacheRef.current.set(chapterId, nextContent);
    }
    setContent(nextContent);
  }, []);
  const handleEditorReady = useCallback((editor: Editor | null) => {
    setEditorInstance(editor);
    if (editor) setCursorState(readEditorCursorState(editor));
  }, []);
  const resetManualRhythmSession = useCallback((nextContent: string, chapterId: string | null) => {
    previousContentForRhythmRef.current = nextContent;
    rhythmLoadedChapterIdRef.current = chapterId;
    lastWritingTickRef.current = null;
    setSessionBaseGraphemes(chapterId ? countGraphemes(nextContent) : 0);
    setActiveWritingMs(0);
    setRhythmNow(Date.now());
  }, []);

  const slimDropIn = useMemo(
    () =>
      shouldReduceMotion
        ? fadeOnly
        : {
            initial: { opacity: 0, y: -8 },
            animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_STANDARD } },
            exit: { opacity: 0, y: -6, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
          },
    [shouldReduceMotion],
  );

  const softLiftIn = useMemo(
    () =>
      shouldReduceMotion
        ? fadeOnly
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_STANDARD } },
            exit: { opacity: 0, y: -4, transition: { duration: DUR.fast, ease: EASE_STANDARD } },
          },
    [shouldReduceMotion],
  );

  const readQuery = useQuery({
    queryKey: ["chapter-content", chapter?.id],
    queryFn: () => (chapter ? chapterApi.read({ id: chapter.id }) : Promise.resolve(null)),
    enabled: !!chapter,
  });

  useEffect(() => {
    if (!chapter) {
      setEditorContent("", null);
      setLoaded(false);
      loadedChapterIdRef.current = null;
      setRecoveryPrompt(null);
      setSavePhase("saved");
      setSaveError(null);
      setLastSavedAt(null);
      setCursorState(DEFAULT_CURSOR_STATE);
      lastRestoredPositionChapterRef.current = null;
      setRhythmState(createDefaultManualWritingRhythmState());
      resetManualRhythmSession("", null);
      return;
    }
    // Only (re)seed content when we actually switch chapters. Without this guard
    // any invalidateQueries(['chapters']) that produces a new `chapter` object
    // reference (same id) would run this effect, call setContent with the cached
    // readQuery.data.content, and overwrite unsaved keystrokes.
    if (readQuery.data && loadedChapterIdRef.current !== chapter.id) {
      // Flush unsaved content of the previous chapter before switching
      const prevId = loadedChapterIdRef.current;
      if (prevId) {
        contentCacheRef.current.set(prevId, contentRef.current);
        if (contentRef.current !== lastSavedRef.current) {
          const pendingContent = contentRef.current;
          const wc = computeWordCount(pendingContent).graphemes;
          void chapterApi.update({ id: prevId, wordCount: wc, content: pendingContent }).catch(() => {});
        }
      }
      const cached = contentCacheRef.current.get(chapter.id);
      const initialContent = cached ?? readQuery.data.content;
      setEditorContent(initialContent, chapter.id);
      let storedRhythmState = createDefaultManualWritingRhythmState();
      try {
        storedRhythmState = parseManualWritingRhythmState(
          window.localStorage.getItem(manualWritingRhythmStorageKey(chapter.projectId, chapter.id)),
        );
      } catch {
        storedRhythmState = createDefaultManualWritingRhythmState();
      }
      setRhythmState(storedRhythmState);
      resetManualRhythmSession(initialContent, chapter.id);
      lastSavedRef.current = readQuery.data.content;
      lastAutosavedRef.current = readQuery.data.content;
      setSavePhase(initialContent === readQuery.data.content ? "saved" : "queued");
      setSaveError(null);
      setLastSavedAt(
        readQuery.data.chapter.updatedAt ? new Date(readQuery.data.chapter.updatedAt).getTime() : Date.now(),
      );
      setLoaded(true);
      loadedChapterIdRef.current = chapter.id;
      // Peek autosave sidecar; if newer than DB copy, offer recovery.
      void chapterApi
        .autosavePeek({ id: chapter.id })
        .then((peek) => {
          if (peek.content !== null && peek.savedAt !== null && peek.content !== readQuery.data?.content) {
            setRecoveryPrompt({ content: peek.content, savedAt: peek.savedAt });
          } else {
            setRecoveryPrompt(null);
          }
        })
        .catch(() => setRecoveryPrompt(null));
    }
  }, [readQuery.data, chapter, resetManualRhythmSession, setEditorContent]);

  useEffect(() => {
    if (!chapter || !loaded || !readQuery.data) return;
    if (loadedChapterIdRef.current !== chapter.id) return;
    const nextContent = readQuery.data.content;
    if (nextContent === lastSavedRef.current) return;
    // When another workflow overwrites this chapter, reload it only if the
    // editor has no local unsaved edits. This keeps bulk rewrite visible
    // without clobbering active typing.
    if (contentRef.current !== lastSavedRef.current) return;
    contentCacheRef.current.set(chapter.id, nextContent);
    lastSavedRef.current = nextContent;
    lastAutosavedRef.current = nextContent;
    setEditorContent(nextContent, chapter.id);
    resetManualRhythmSession(nextContent, chapter.id);
    setSavePhase("saved");
    setSaveError(null);
    setLastSavedAt(
      readQuery.data.chapter.updatedAt ? new Date(readQuery.data.chapter.updatedAt).getTime() : Date.now(),
    );
    setRecoveryPrompt(null);
  }, [chapter, loaded, readQuery.data, resetManualRhythmSession, setEditorContent]);

  useEffect(() => { contentRef.current = content; }, [content]);

  const persistManualRhythmState = useCallback(
    (nextState: ManualWritingRhythmState) => {
      const normalized = createDefaultManualWritingRhythmState(nextState);
      setRhythmState(normalized);
      if (!chapter || rhythmLoadedChapterIdRef.current !== chapter.id) return;
      try {
        window.localStorage.setItem(
          manualWritingRhythmStorageKey(chapter.projectId, chapter.id),
          serializeManualWritingRhythmState(normalized),
        );
      } catch {
        // localStorage can be unavailable in restricted renderer contexts.
      }
    },
    [chapter],
  );

  useEffect(() => {
    if (!chapter || !loaded || rhythmLoadedChapterIdRef.current !== chapter.id) return;
    if (content === previousContentForRhythmRef.current) return;

    const now = Date.now();
    const lastTick = lastWritingTickRef.current;
    if (lastTick !== null) {
      const gap = now - lastTick;
      if (gap > 0 && gap <= MANUAL_RHYTHM_ACTIVE_WINDOW_MS) {
        setActiveWritingMs((current) => current + gap);
      }
    }
    lastWritingTickRef.current = now;
    setRhythmNow(now);
    previousContentForRhythmRef.current = content;

    const line = editorInstance ? readEditorCursorState(editorInstance).lineNumber : cursorState.lineNumber;
    const cue = readManualRhythmCue(content, line);
    if (!cue.text) return;

    persistManualRhythmState(
      createDefaultManualWritingRhythmState({
        ...rhythmState,
        lastCueText: cue.text,
        lastLine: cue.line,
        lastUpdatedAt: now,
      }),
    );
  }, [chapter, content, cursorState.lineNumber, editorInstance, loaded, persistManualRhythmState, rhythmState]);

  useEffect(() => {
    if (!chapter || !loaded || !rhythmState.lastUpdatedAt) return;
    const handle = window.setInterval(() => setRhythmNow(Date.now()), 30_000);
    return () => window.clearInterval(handle);
  }, [chapter, loaded, rhythmState.lastUpdatedAt]);

  // 字数统计仅用于显示（编辑器工具栏 / 状态栏 / 工作流栏阈值），不参与保存时的真实字数
  // 计算（保存路径在落盘时另算 computeWordCount）。computeWordCount + computeWordStats 会
  // 对全文做多趟 Intl.Segmenter / 正则扫描，长章节里每次按键都重算会拖慢输入手感；这里把
  // 统计去抖到停顿 250ms 之后再算，让按键热路径保持轻量，显示值停顿后刷新。
  const statsText = useDebouncedValue(content, 250);
  const stats = useMemo(() => computeWordCount(statsText), [statsText]);
  const currentGraphemes = useMemo(() => countGraphemes(content), [content]);
  const sessionAddedGraphemes = Math.max(0, currentGraphemes - sessionBaseGraphemes);
  const resumeCue = useMemo(() => buildManualWritingResumeCue(rhythmState, rhythmNow), [rhythmNow, rhythmState]);
  const setCurrentChapterStats = useAppStore((s) => s.setCurrentChapterStats);

  useEffect(() => {
    if (!chapter) {
      setCurrentChapterStats(null);
      return;
    }
    const ws = computeWordStats(statsText);
    setCurrentChapterStats({
      cjk: ws.cjk,
      en: ws.en,
      tokens: ws.tokens,
      graphemes: stats.graphemes,
    });
  }, [statsText, chapter, stats.graphemes, setCurrentChapterStats]);

  useEffect(() => () => setCurrentChapterStats(null), [setCurrentChapterStats]);

  const invalidateDailyProgress = useCallback(
    (projectId: string) => {
      const now = Date.now();
      const last = dailyProgressInvalidatedAtRef.current.get(projectId) ?? 0;
      if (now - last < 5_000) return;
      dailyProgressInvalidatedAtRef.current.set(projectId, now);
      void queryClient.invalidateQueries({ queryKey: ["daily-progress", projectId] });
    },
    [queryClient],
  );

  const drainSaveQueue = useCallback((): Promise<void> => {
    if (saveLoopPromiseRef.current) return saveLoopPromiseRef.current;

    const loop = async (): Promise<void> => {
      while (saveQueueRef.current) {
        const request = saveQueueRef.current;
        saveQueueRef.current = null;
        setSavePhase("saving");
        setSaveError(null);
        try {
          const updatedChapter = await chapterApi.update({
            id: request.chapterId,
            wordCount: request.wordCount,
            content: request.content,
          });
          queryClient.setQueryData<ChapterReadResponse | null>(
            ["chapter-content", request.chapterId],
            (current) => (current ? { chapter: updatedChapter, content: request.content } : current),
          );
          queryClient.setQueryData(
            ["chapter-heading-outline", request.chapterId],
            extractChapterHeadings(request.chapterId, request.content),
          );
          if (loadedChapterIdRef.current === request.chapterId) {
            lastSavedRef.current = request.content;
            setLastSavedAt(Date.now());
            if (contentRef.current === request.content) {
              lastAutosavedRef.current = request.content;
              setSavePhase("saved");
              void chapterApi.autosaveClear({ id: request.chapterId }).catch(() => {});
            } else {
              setSavePhase("queued");
            }
          }
          invalidateDailyProgress(request.projectId);
        } catch (err) {
          if (!saveQueueRef.current) {
            saveQueueRef.current = request;
          }
          setSavePhase("error");
          setSaveError(friendlyErrorMessage(err, "保存失败，请稍后重试。"));
          throw err;
        }
      }
    };

    const promise = loop().finally(() => {
      saveLoopPromiseRef.current = null;
    });
    saveLoopPromiseRef.current = promise;
    return promise;
  }, [invalidateDailyProgress, queryClient]);

  const queueSave = useCallback(
    (request: SaveRequest): Promise<void> => {
      saveQueueRef.current = request;
      setSaveError(null);
      setSavePhase("queued");
      return drainSaveQueue();
    },
    [drainSaveQueue],
  );

  const buildCurrentSaveRequest = useCallback((): SaveRequest | null => {
    if (!chapter || !loaded) return null;
    const snapshot = contentRef.current;
    return {
      chapterId: chapter.id,
      projectId: chapter.projectId,
      content: snapshot,
      wordCount: computeWordCount(snapshot).graphemes,
    };
  }, [chapter, loaded]);

  const flushCurrentContent = useCallback(async (): Promise<void> => {
    const request = buildCurrentSaveRequest();
    if (!request) return;
    if (request.content === lastSavedRef.current && !saveQueueRef.current) return;
    await queueSave(request);
  }, [buildCurrentSaveRequest, queueSave]);

  useEffect(() => {
    if (!chapter || !loaded) return;
    if (content === lastSavedRef.current) return;
    setSavePhase("queued");
    const snapshot = content;
    const handle = setTimeout(() => {
      void queueSave({
        chapterId: chapter.id,
        projectId: chapter.projectId,
        content: snapshot,
        wordCount: computeWordCount(snapshot).graphemes,
      }).catch(() => {});
    }, 500);  // 修复：降低防抖到 500ms，提升写作手感
    return () => clearTimeout(handle);
  }, [content, chapter, loaded, queueSave]);

  const handleManualSave = useCallback(() => {
    void flushCurrentContent().then(() => {
      if (!chapter) {
        showExportStatus({ kind: "success", text: "已保存" }, 2500);
        return;
      }
      void snapshotApi.create({
        chapterId: chapter.id,
        projectId: chapter.projectId,
        kind: "manual",
        label: `保存 · ${new Date().toLocaleTimeString("zh-CN")}`,
      }).then(() => {
        showExportStatus({ kind: "success", text: "已保存并创建版本备份" }, 3000);
      }).catch(() => {
        showExportStatus({ kind: "success", text: "已保存" }, 2500);
      });
    }).catch(() => {});
  }, [flushCurrentContent, chapter, showExportStatus]);

  const jumpEditorToText = useCallback((needles: Array<{ text: string; occurrence?: number }>): boolean => {
    if (!editorInstance) return false;
    const candidates = needles
      .map((item) => ({ text: item.text.trim(), occurrence: item.occurrence ?? 0 }))
      .filter((item, index, arr) =>
        item.text.length > 0 &&
        arr.findIndex((candidate) => candidate.text === item.text && candidate.occurrence === item.occurrence) === index,
      );
    for (const candidate of candidates) {
      let found: { from: number; to: number } | null = null;
      let remaining = Math.max(0, candidate.occurrence);
      editorInstance.state.doc.descendants((node, pos) => {
        if (found || !node.isText || !node.text) return !found;
        let startIndex = 0;
        while (startIndex <= node.text.length) {
          const index = node.text.indexOf(candidate.text, startIndex);
          if (index < 0) return true;
          if (remaining > 0) {
            remaining -= 1;
            startIndex = index + candidate.text.length;
            continue;
          }
          found = { from: pos + index, to: pos + index + candidate.text.length };
          return false;
        }
        return false;
      });
      if (found) {
        editorInstance.chain().focus().setTextSelection(found).run();
        const { from } = found;
        const posCoords = editorInstance.view.coordsAtPos(from);
        if (posCoords) {
          const scrollEl = editorInstance.view.dom.closest(".overflow-auto,.scrollbar-thin") as HTMLElement | null;
          if (scrollEl) {
            const targetTop = posCoords.top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - 120;
            scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
          }
        }
        return true;
      }
    }
    return false;
  }, [editorInstance]);

  // A2: Review→Editor 跳转——检测 reviewJumpExcerpt 文本变化，
  // 用现有 jumpEditorToText 滚动到对应摘录位置。
  const reviewJumpExcerpt = useAppStore((s) => s.reviewJumpExcerpt);
  const setReviewJumpExcerpt = useAppStore((s) => s.setReviewJumpExcerpt);
  useEffect(() => {
    if (!chapter || !loaded || !editorInstance || !reviewJumpExcerpt) return;
    // 延迟等编辑器完成内容同步后再跳转
    const timer = window.setTimeout(() => {
      // 取摘录的前 60 个字符作为搜索关键词（去掉首尾空白）
      const needle = reviewJumpExcerpt.trim().slice(0, 60);
      if (needle.length >= 4) {
        jumpEditorToText([{ text: needle }]);
      }
      lastRestoredPositionChapterRef.current = chapter.id;
      setReviewJumpExcerpt(null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [reviewJumpExcerpt, chapter, loaded, editorInstance, jumpEditorToText, setReviewJumpExcerpt]);

  useEffect(() => {
    if (!chapter || !loaded || !editorInstance || !headingJumpTarget) return;
    if (headingJumpTarget.chapterId !== chapter.id) return;
    if (lastHeadingJumpNonceRef.current === headingJumpTarget.nonce) return;
    lastHeadingJumpNonceRef.current = headingJumpTarget.nonce;

    const timer = window.setTimeout(() => {
      const lines = contentRef.current.split(/\r?\n/);
      const lineIndex = Math.max(0, headingJumpTarget.line - 1);
      const headingLine = lines[lineIndex]?.trim();
      const headingLineOccurrence = headingLine
        ? Math.max(
            0,
            lines.slice(0, lineIndex + 1).filter((line) => line.trim() === headingLine).length - 1,
          )
        : 0;
      const jumped = jumpEditorToText([
        { text: headingLine ?? "", occurrence: headingLineOccurrence },
        { text: `## ${headingJumpTarget.title}` },
        { text: `### ${headingJumpTarget.title}` },
        { text: `#### ${headingJumpTarget.title}` },
        { text: headingJumpTarget.title },
      ]);
      if (!jumped) {
        editorInstance.commands.focus();
        const finder = (window as unknown as {
          find?: (
            searchString: string,
            caseSensitive?: boolean,
            backwards?: boolean,
            wrapAround?: boolean,
            wholeWord?: boolean,
            searchInFrames?: boolean,
            showDialog?: boolean,
          ) => boolean;
        }).find;
        finder?.(headingLine || headingJumpTarget.title, false, false, true, false, false, false);
      }
      lastRestoredPositionChapterRef.current = chapter.id;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [chapter, editorInstance, headingJumpTarget, jumpEditorToText, loaded]);

  const updateCursorState = useCallback(() => {
    if (!editorInstance) {
      setCursorState(DEFAULT_CURSOR_STATE);
      return;
    }
    const next = readEditorCursorState(editorInstance);
    setCursorState((current) =>
      current.lineNumber === next.lineNumber &&
      current.paragraphGraphemes === next.paragraphGraphemes &&
      current.selectedGraphemes === next.selectedGraphemes
        ? current
        : next,
    );
  }, [editorInstance]);

  const persistEditorPosition = useCallback(() => {
    if (!chapter || !editorInstance) return;
    try {
      const scrollEl = getEditorScrollElement(editorInstance);
      const chapterUpdatedAt = "updatedAt" in chapter && typeof chapter.updatedAt === "string" ? chapter.updatedAt : "";
      const position: StoredEditorPosition = {
        pos: editorInstance.state.selection.from,
        scrollTop: scrollEl?.scrollTop ?? 0,
        updatedAt: chapterUpdatedAt,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(
        editorPositionStorageKey(chapter.projectId, chapter.id),
        JSON.stringify(position),
      );
    } catch {
      // localStorage can be unavailable in restricted renderer contexts.
    }
  }, [chapter, editorInstance]);

  const schedulePersistEditorPosition = useCallback(() => {
    if (positionSaveFrameRef.current !== null) return;
    positionSaveFrameRef.current = window.requestAnimationFrame(() => {
      positionSaveFrameRef.current = null;
      persistEditorPosition();
    });
  }, [persistEditorPosition]);

  useEffect(() => {
    if (!editorInstance || !chapter || !loaded) return;
    const syncPosition = () => {
      updateCursorState();
      schedulePersistEditorPosition();
    };
    const scrollEl = getEditorScrollElement(editorInstance);
    syncPosition();
    editorInstance.on("selectionUpdate", syncPosition);
    editorInstance.on("update", syncPosition);
    scrollEl?.addEventListener("scroll", schedulePersistEditorPosition, { passive: true });
    return () => {
      persistEditorPosition();
      editorInstance.off("selectionUpdate", syncPosition);
      editorInstance.off("update", syncPosition);
      scrollEl?.removeEventListener("scroll", schedulePersistEditorPosition);
      if (positionSaveFrameRef.current !== null) {
        window.cancelAnimationFrame(positionSaveFrameRef.current);
        positionSaveFrameRef.current = null;
      }
    };
  }, [chapter, editorInstance, loaded, persistEditorPosition, schedulePersistEditorPosition, updateCursorState]);

  useEffect(() => {
    if (!chapter || !loaded || !editorInstance) return;
    if (lastRestoredPositionChapterRef.current === chapter.id) return;
    const pendingHeadingJump =
      headingJumpTarget?.chapterId === chapter.id && lastHeadingJumpNonceRef.current !== headingJumpTarget.nonce;
    if (reviewJumpExcerpt || pendingHeadingJump) return;
    let stored: StoredEditorPosition | null = null;
    try {
      stored = readStoredEditorPosition(
        window.localStorage.getItem(editorPositionStorageKey(chapter.projectId, chapter.id)),
      );
    } catch {
      stored = null;
    }
    if (!stored) {
      lastRestoredPositionChapterRef.current = chapter.id;
      updateCursorState();
      return;
    }
    const timer = window.setTimeout(() => {
      const pos = clampEditorPosition(editorInstance, stored.pos);
      editorInstance.commands.setTextSelection(pos);
      const scrollEl = getEditorScrollElement(editorInstance);
      if (scrollEl) scrollEl.scrollTop = Math.max(0, stored.scrollTop);
      updateCursorState();
      lastRestoredPositionChapterRef.current = chapter.id;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [chapter, editorInstance, headingJumpTarget, loaded, reviewJumpExcerpt, updateCursorState]);

  const insertParagraphText = useCallback((paragraphText: string) => {
    if (!editorInstance) return;
    editorInstance.chain().focus().insertContent({
      type: "paragraph",
      content: paragraphText ? [{ type: "text", text: paragraphText }] : [],
    }).run();
  }, [editorInstance]);

  const insertInlineText = useCallback((value: string) => {
    if (!editorInstance) return;
    const { state, view } = editorInstance;
    view.dispatch(state.tr.insertText(value, state.selection.from, state.selection.to).scrollIntoView());
    editorInstance.commands.focus();
  }, [editorInstance]);

  const insertHeading = useCallback((level: 1 | 2) => {
    insertParagraphText(`${"#".repeat(level)} `);
  }, [insertParagraphText]);

  const insertSceneBreak = useCallback(() => {
    if (!editorInstance) return;
    editorInstance.chain().focus().insertContent([
      { type: "paragraph", content: [{ type: "text", text: "---" }] },
      { type: "paragraph" },
    ]).run();
  }, [editorInstance]);

  const insertFullWidthIndent = useCallback(() => {
    insertInlineText("\u3000\u3000");
  }, [insertInlineText]);

  const insertTodoMarker = useCallback(() => {
    insertInlineText("\u3010\u5f85\u8865\uff1a\u3011");
  }, [insertInlineText]);

  const handleNextBeatChange = useCallback((value: string) => {
    persistManualRhythmState(
      createDefaultManualWritingRhythmState({
        ...rhythmState,
        nextBeat: normalizeNextBeat(value),
      }),
    );
  }, [persistManualRhythmState, rhythmState]);

  const handleClearNextBeat = useCallback(() => {
    persistManualRhythmState(
      createDefaultManualWritingRhythmState({
        ...rhythmState,
        nextBeat: "",
      }),
    );
  }, [persistManualRhythmState, rhythmState]);

  const handleSessionGoalChange = useCallback((value: number) => {
    persistManualRhythmState(
      createDefaultManualWritingRhythmState({
        ...rhythmState,
        sessionGoal: value,
      }),
    );
  }, [persistManualRhythmState, rhythmState]);

  const handleInsertNextBeatTodo = useCallback(() => {
    const beat = normalizeNextBeat(rhythmState.nextBeat);
    if (!beat || !editorInstance) return;
    insertInlineText(`\u3010\u5f85\u8865\uff1a${beat}\u3011`);
    showExportStatus({ kind: "success", text: "\u5df2\u63d2\u5165\u5f85\u8865" }, 1800);
  }, [editorInstance, insertInlineText, rhythmState.nextBeat, showExportStatus]);

  const handleJumpToResumeCue = useCallback(() => {
    if (!resumeCue) return;
    const jumped = jumpEditorToText([{ text: resumeCue.text }]);
    if (jumped) {
      showExportStatus({ kind: "success", text: "\u5df2\u56de\u5230\u4e0a\u6b21\u505c\u7b14\u5904" }, 1800);
      return;
    }
    showExportStatus({ kind: "error", text: "\u672a\u627e\u5230\u4e0a\u6b21\u505c\u7b14\u7247\u6bb5" }, 2600);
  }, [jumpEditorToText, resumeCue, showExportStatus]);

  const chapterHeadings = useMemo(() => (chapter ? extractChapterHeadings(chapter.id, content) : []), [chapter, content]);
  const chapterMapItems = useMemo(
    () => (chapter ? extractManualChapterMap(chapter.id, content) : []),
    [chapter, content],
  );

  const currentEditorLine = useCallback((): number => {
    if (!editorInstance) return 1;
    const before = editorInstance.state.doc.textBetween(0, editorInstance.state.selection.from, "\n", "\n");
    return before.split(/\r?\n/).length;
  }, [editorInstance]);

  const currentHeading = useMemo(() => {
    if (chapterHeadings.length === 0) return null;
    const line = cursorState.lineNumber || currentEditorLine();
    return [...chapterHeadings].reverse().find((heading) => heading.line <= line) ?? chapterHeadings[0];
  }, [chapterHeadings, currentEditorLine, cursorState.lineNumber]);

  const jumpToHeadingItem = useCallback((heading: { title: string; level?: number }) => {
    const level = Math.max(1, Math.min(4, heading.level ?? 1));
    const marker = `${"#".repeat(level)} ${heading.title}`;
    const jumped = jumpEditorToText([
      { text: marker },
      { text: `# ${heading.title}` },
      { text: `## ${heading.title}` },
      { text: `### ${heading.title}` },
      { text: `#### ${heading.title}` },
      { text: heading.title },
    ]);
    if (jumped) {
      showExportStatus({ kind: "success", text: `\u5df2\u8df3\u5230\u300c${heading.title}\u300d` }, 1800);
    }
  }, [jumpEditorToText, showExportStatus]);

  const jumpToChapterMapItem = useCallback((item: ManualChapterMapItem): boolean => {
    if (item.kind === "heading") {
      const level = Math.max(1, Math.min(4, item.level ?? 1));
      const marker = `${"#".repeat(level)} ${item.label}`;
      const jumped = jumpEditorToText([
        { text: item.raw, occurrence: item.occurrence },
        { text: marker, occurrence: item.occurrence },
        { text: `# ${item.label}` },
        { text: `## ${item.label}` },
        { text: `### ${item.label}` },
        { text: `#### ${item.label}` },
        { text: item.label },
      ]);
      if (jumped) {
        showExportStatus({ kind: "success", text: `已跳到「${item.label}」` }, 1800);
      } else {
        showExportStatus({ kind: "error", text: "未找到对应标题" }, 2200);
      }
      return jumped;
    }

    if (item.kind === "scene") {
      const jumped = jumpEditorToText([{ text: item.raw, occurrence: item.occurrence }]);
      if (jumped) {
        showExportStatus({ kind: "success", text: `已跳到${item.label}` }, 1800);
      } else {
        showExportStatus({ kind: "error", text: "未找到对应场景" }, 2200);
      }
      return jumped;
    }

    const jumped = jumpEditorToText([{ text: item.raw, occurrence: item.occurrence }]);
    if (jumped) {
      showExportStatus({ kind: "success", text: `已跳到「${item.label}」` }, 1800);
    } else {
      showExportStatus({ kind: "error", text: "未找到对应待补" }, 2200);
    }
    return jumped;
  }, [jumpEditorToText, showExportStatus]);

  const normalizeCurrentSelection = useCallback(() => {
    if (!editorInstance) return;
    const { state } = editorInstance;
    const { selection } = state;
    const from = selection.empty ? selection.$from.start() : selection.from;
    const to = selection.empty ? selection.$from.end() : selection.to;
    const source = selection.empty
      ? selection.$from.parent.textContent
      : state.doc.textBetween(from, to, "\n", "\n");
    const normalized = normalizeManualSelection(source);
    if (normalized === source) {
      showExportStatus({ kind: "success", text: "当前段落已整洁" }, 1600);
      return;
    }
    if (normalized.includes("\n")) {
      editorInstance
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent(plainTextToEditorHtml(normalized))
        .run();
    } else {
      editorInstance.view.dispatch(state.tr.insertText(normalized, from, to).scrollIntoView());
      editorInstance.commands.focus();
    }
    showExportStatus({ kind: "success", text: "已整理当前段/选区" }, 1800);
  }, [editorInstance, showExportStatus]);

  const insertParagraphBreak = useCallback((placement: "before" | "after") => {
    if (!editorInstance) return;
    const { state } = editorInstance;
    const depth = state.selection.$from.depth;
    if (depth <= 0) return;
    const insertPos = placement === "before" ? state.selection.$from.before(depth) : state.selection.$from.after(depth);
    const targetPos = insertPos + 1;
    editorInstance
      .chain()
      .focus()
      .insertContentAt(insertPos, { type: "paragraph" })
      .setTextSelection(targetPos)
      .run();
  }, [editorInstance]);

  const moveCurrentParagraph = useCallback((direction: "up" | "down") => {
    if (!editorInstance) return;
    const { state, view } = editorInstance;
    const selectionFrom = state.selection.from;
    const blocks: Array<{ from: number; to: number; nodeSize: number; node: unknown }> = [];
    state.doc.forEach((node, offset) => {
      blocks.push({ from: offset, to: offset + node.nodeSize, nodeSize: node.nodeSize, node });
    });
    const currentIndex = blocks.findIndex((block) => selectionFrom >= block.from && selectionFrom <= block.to);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const current = blocks[currentIndex];
    const target = blocks[targetIndex];
    if (!current || !target) return;

    const offsetInsideBlock = Math.max(1, Math.min(selectionFrom - current.from, current.nodeSize - 1));
    const node = current.node as Parameters<typeof state.tr.insert>[1];
    const insertPos = direction === "up" ? target.from : target.to - current.nodeSize;
    const nextSelection = clampEditorPosition(editorInstance, insertPos + offsetInsideBlock);
    const tr = state.tr.delete(current.from, current.to).insert(insertPos, node).scrollIntoView();
    view.dispatch(tr);
    editorInstance.commands.setTextSelection(nextSelection);
    editorInstance.commands.focus();
  }, [editorInstance]);

  const jumpHeading = useCallback((direction: "previous" | "next") => {
    if (chapterHeadings.length === 0) {
      showExportStatus({ kind: "error", text: "\u5f53\u524d\u7ae0\u8282\u6ca1\u6709\u6807\u9898" }, 2200);
      return;
    }
    const line = currentEditorLine();
    const target = direction === "next"
      ? chapterHeadings.find((heading) => heading.line > line) ?? chapterHeadings[0]
      : [...chapterHeadings].reverse().find((heading) => heading.line < line) ?? chapterHeadings[chapterHeadings.length - 1];
    jumpToHeadingItem(target);
  }, [chapterHeadings, currentEditorLine, jumpToHeadingItem, showExportStatus]);

  const findQuery = findText.trim();
  const findMatches = useMemo<EditorFindMatch[]>(() => {
    if (!findOpen || !editorInstance || !findQuery) return [];
    const matches: EditorFindMatch[] = [];
    editorInstance.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      for (const match of findTextMatches(node.text, findQuery, findOptions)) {
        matches.push({
          from: pos + match.index,
          to: pos + match.index + match.length,
          text: match.text,
        });
      }
      return true;
    });
    return matches;
  }, [content, editorInstance, findOpen, findOptions, findQuery]);

  const selectFindMatch = useCallback((index: number) => {
    if (!editorInstance || findMatches.length === 0) return;
    const nextIndex = ((index % findMatches.length) + findMatches.length) % findMatches.length;
    const match = findMatches[nextIndex];
    editorInstance.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    setActiveFindIndex(nextIndex);
    setReplaceConfirm(false);
    setFindStatus(null);
    try {
      const coords = editorInstance.view.coordsAtPos(match.from);
      const scrollEl = editorInstance.view.dom.closest(".overflow-auto,.scrollbar-thin") as HTMLElement | null;
      if (scrollEl) {
        const targetTop = coords.top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - 120;
        scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      }
    } catch {
      // Ignore stale coordinates while the editor is updating.
    }
  }, [editorInstance, findMatches]);

  const runFind = useCallback(
    (backwards = false) => {
      if (!findQuery) return;
      if (findMatches.length === 0) {
        setFindStatus("未找到");
        return;
      }
      const selection = editorInstance?.state.selection;
      const selectedIndex = selection
        ? findMatches.findIndex((match) => match.from === selection.from && match.to === selection.to)
        : -1;
      const baseIndex = selectedIndex >= 0 ? selectedIndex : activeFindIndex;
      selectFindMatch(selectedIndex >= 0 ? baseIndex + (backwards ? -1 : 1) : (backwards ? findMatches.length - 1 : 0));
    },
    [activeFindIndex, editorInstance, findMatches, findQuery, selectFindMatch],
  );

  const replaceCurrentMatch = useCallback(() => {
    if (!editorInstance || findMatches.length === 0) {
      setFindStatus("没有可替换内容");
      return;
    }
    const match = findMatches[Math.min(activeFindIndex, findMatches.length - 1)];
    editorInstance.view.dispatch(editorInstance.state.tr.insertText(replaceText, match.from, match.to));
    editorInstance.commands.focus();
    setReplaceConfirm(false);
    setFindStatus("已替换 1 处");
  }, [activeFindIndex, editorInstance, findMatches, replaceText]);

  const replaceAllMatches = useCallback(() => {
    if (!editorInstance || findMatches.length === 0) {
      setFindStatus("没有可替换内容");
      return;
    }
    if (findMatches.length > 1 && !replaceConfirm) {
      setReplaceConfirm(true);
      setFindStatus(`将替换 ${findMatches.length} 处`);
      return;
    }
    let tr = editorInstance.state.tr;
    for (const match of [...findMatches].reverse()) {
      tr = tr.insertText(replaceText, match.from, match.to);
    }
    editorInstance.view.dispatch(tr);
    editorInstance.commands.focus();
    setActiveFindIndex(0);
    setReplaceConfirm(false);
    setFindStatus(`已替换 ${findMatches.length} 处`);
  }, [editorInstance, findMatches, replaceConfirm, replaceText]);

  useEffect(() => {
    if (!findOpen) return;
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  }, [findOpen]);

  useEffect(() => {
    setReplaceConfirm(false);
    if (!findOpen || !findQuery) {
      setFindStatus(null);
      setActiveFindIndex(0);
      return;
    }
    if (findMatches.length === 0) {
      setFindStatus("未找到");
      setActiveFindIndex(0);
      return;
    }
    setActiveFindIndex((index) => Math.min(index, findMatches.length - 1));
    setFindStatus(null);
  }, [findMatches.length, findOpen, findOptions, findQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleManualSave]);

  const writeAutosaveSidecar = useCallback(() => {
    if (!chapter || !loaded) return;
    const snapshot = contentRef.current;
    if (snapshot === lastSavedRef.current || snapshot === lastAutosavedRef.current) return;
    void chapterApi
      .autosaveWrite({ id: chapter.id, content: snapshot })
      .then(() => {
        lastAutosavedRef.current = snapshot;
      })
      .catch(() => {});
  }, [chapter, loaded]);

  useEffect(() => {
    const handleBeforeUnload = () => writeAutosaveSidecar();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") writeAutosaveSidecar();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [writeAutosaveSidecar]);

  // Disk-autosave sidecar every ~5s while typing. Runs in parallel to the 1.2s
  // DB save so that a crash between DB saves still leaves a recoverable copy.
  useEffect(() => {
    if (!chapter || !loaded) return;
    if (content === lastAutosavedRef.current) return;
    const handle = setTimeout(() => {
      writeAutosaveSidecar();
    }, 5000);
    return () => clearTimeout(handle);
  }, [content, chapter, loaded, writeAutosaveSidecar]);

  // A1: 注册视图切换前的同步落盘钩子到全局 store。
  // 当用户从写作页切到其他视图时，setMainView 在切换前会先调用此函数，
  // 把当前内容写入磁盘 sidecar（同步发起 IPC，不阻塞但保证请求已发出）。
  // 用 ref 持有最新函数引用，避免 chapter 变化导致反复注销/重注册。
  const writeAutosaveSidecarRef = useRef(writeAutosaveSidecar);
  writeAutosaveSidecarRef.current = writeAutosaveSidecar;
  const flushCurrentContentRef = useRef(flushCurrentContent);
  flushCurrentContentRef.current = flushCurrentContent;

  const registerBeforeLeaveView = useAppStore((s) => s.registerBeforeLeaveView);
  useEffect(() => {
    registerBeforeLeaveView(() => {
      writeAutosaveSidecarRef.current();
      void flushCurrentContentRef.current().catch(() => {});
    });
    return () => registerBeforeLeaveView(null);
    // 仅在挂载/卸载时注册，不依赖 chapter 等会频繁变化的引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卸载兜底落盘：切换主视图（writing → world 等）会卸载本组件，此时 1.2s 防抖 DB 保存与
  // 5s 磁盘自动保存的计时器都会随 effect 清理被取消，而 beforeunload/visibilitychange 在
  // 应用内视图切换时并不触发。若用户刚打字就切走，这不到 1.2s 的新内容会随 React 状态丢失。
  // 这里用 latest-ref 在「真正卸载」时（空依赖，切章不会触发——切章另有 flush）兜底刷一次：
  // DB 落盘 + 磁盘 sidecar，确保切视图也不丢字（只新增保存，永不清空，最坏只是一次冗余保存）。
  const flushOnExitRef = useRef<() => void>(() => {});
  flushOnExitRef.current = () => {
    void flushCurrentContent().catch(() => {});
    writeAutosaveSidecar();
  };
  useEffect(() => () => flushOnExitRef.current(), []);

  const resolvedProviderId = useMemo(() => {
    if (activeProviderId && providers.some((p) => p.id === activeProviderId)) return activeProviderId;
    return providers[0]?.id;
  }, [activeProviderId, providers]);

  const { rebaseline } = useAnalysisTrigger({
    text: content,
    threshold: analysisThreshold,
    debounceMs: 10_000,
    language: "zh",
    enabled: loaded && analysisEnabled,
    // 基线键＝当前章节 id（仅正文载入后生效）。切章 / 首次载入即把"新增字数"基线
    // 对齐到当前正文长度，避免把刚载入的整章误当新增、开章就全文分析、狂烧 token。
    baselineKey: loaded ? chapter?.id ?? null : null,
    onTrigger: () => {
      if (!chapter) return;
      activeAnalysisChapterRef.current = chapter.id;
      void llmApi.analyze({
        projectId: chapter.projectId,
        chapterId: chapter.id,
        chapterText: content,
        providerId: resolvedProviderId,
        trigger: "auto-200",
      });
    },
  });

  const handleExport = async () => {
    if (!chapter) return;
    showExportStatus({ kind: "busy", text: "导出中…" });
    try {
      const exportResult = await chapterApi.exportMd({ id: chapter.id });
      const result = await fsApi.saveFile({
        defaultPath: exportResult.fileName,
        content: exportResult.content,
      });
      if (result.path) showExportStatus({ kind: "success", text: "已导出" }, 3000);
      else showExportStatus(null);
    } catch (err) {
      showExportStatus({
        kind: "error",
        text: `导出失败：${friendlyErrorMessage(err, "导出失败，请稍后重试。")}`,
      });
    }
  };

  const handleManualAnalyze = useCallback(() => {
    if (!chapter) return;
    // Manual analysis should use the existing chapter analysis contract.
    rebaseline();
    activeAnalysisChapterRef.current = chapter.id;
    void llmApi.analyze({
      projectId: chapter.projectId,
      chapterId: chapter.id,
      chapterText: content,
      providerId: resolvedProviderId,
      trigger: "manual",
    });
  }, [chapter, content, rebaseline, resolvedProviderId]);

  useEffect(() => {
    const handler = () => handleManualAnalyze();
    window.addEventListener("inkforge:manual-analyze", handler);
    return () => window.removeEventListener("inkforge:manual-analyze", handler);
  }, [handleManualAnalyze]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EditorCommandDetail>).detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.action === "insert-heading") insertHeading(detail.level);
      if (detail.action === "insert-scene-break") insertSceneBreak();
      if (detail.action === "insert-indent") insertFullWidthIndent();
      if (detail.action === "insert-todo") insertTodoMarker();
      if (detail.action === "jump-heading") jumpHeading(detail.direction);
    };
    window.addEventListener("inkforge:editor-command", handler);
    return () => window.removeEventListener("inkforge:editor-command", handler);
  }, [insertFullWidthIndent, insertHeading, insertSceneBreak, insertTodoMarker, jumpHeading]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editorInstance) return;
      const target = e.target;
      const editorHasFocus =
        editorInstance.view.hasFocus() ||
        (target instanceof Node && editorInstance.view.dom.contains(target));
      if (!editorHasFocus) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "Enter") {
        e.preventDefault();
        insertParagraphBreak(e.shiftKey ? "before" : "after");
        return;
      }

      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowUp") {
        e.preventDefault();
        moveCurrentParagraph("up");
        return;
      }
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowDown") {
        e.preventDefault();
        moveCurrentParagraph("down");
        return;
      }

      const ctrlAlt = e.altKey && (e.ctrlKey || e.metaKey);
      if (ctrlAlt) {
        if (e.code === "Digit1") {
          e.preventDefault();
          insertHeading(1);
          return;
        }
        if (e.code === "Digit2") {
          e.preventDefault();
          insertHeading(2);
          return;
        }
        if (e.code === "Minus" || e.key === "-") {
          e.preventDefault();
          insertSceneBreak();
          return;
        }
        if (e.code === "BracketRight" || e.key === "]") {
          e.preventDefault();
          insertFullWidthIndent();
          return;
        }
        if (e.code === "KeyT" || e.key.toLowerCase() === "t") {
          e.preventDefault();
          insertTodoMarker();
          return;
        }
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowUp") {
        e.preventDefault();
        jumpHeading("previous");
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowDown") {
        e.preventDefault();
        jumpHeading("next");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorInstance, insertFullWidthIndent, insertHeading, insertParagraphBreak, insertSceneBreak, insertTodoMarker, jumpHeading, moveCurrentParagraph]);

  const manualSkillsQuery = useQuery({
    queryKey: ["skills", "manual", chapter?.projectId ?? null],
    queryFn: () => skillApi.list({ enabledOnly: true }),
    enabled: !!chapter,
  });
  const manualSkills = useMemo<SkillDefinition[]>(() => {
    return (manualSkillsQuery.data ?? []).filter((skill) =>
      skill.triggers.some((t) => t.type === "manual" && t.enabled),
    );
  }, [manualSkillsQuery.data]);

  const outlineCardsQuery = useQuery<OutlineCardRecord[]>({
    queryKey: ["outline-cards", chapter?.projectId ?? null],
    queryFn: () => (chapter ? outlineApi.list({ projectId: chapter.projectId }) : Promise.resolve([])),
    enabled: !!chapter,
  });

  const linkedOutlineCard = useMemo(
    () => (outlineCardsQuery.data ?? []).find((card) => card.chapterId === chapter?.id) ?? null,
    [chapter?.id, outlineCardsQuery.data],
  );
  const chapterResearchQuery = useMemo(() => {
    const seed = [
      linkedOutlineCard?.title,
      linkedOutlineCard?.content,
      chapter?.title,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return seed ? `${seed.slice(0, 120)} 资料 背景` : "本章资料 背景";
  }, [chapter?.title, linkedOutlineCard?.content, linkedOutlineCard?.title]);

  useEffect(() => {
    if (!skillMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!skillMenuRef.current) return;
      if (!skillMenuRef.current.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [skillMenuOpen]);

  useEffect(() => {
    if (!snapshotMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!snapshotMenuRef.current) return;
      if (!snapshotMenuRef.current.contains(event.target as Node)) {
        setSnapshotMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [snapshotMenuOpen]);

  useEffect(() => {
    const offDone = skillApi.onDone((payload) => {
      const active = activeSkillRunRef.current;
      if (!active || payload.runId !== active.runId) return;
      if (payload.status === "completed") {
        // 按 Skill 的输出方式落地：ai-feedback 进时间线；其余直接写入正文。
        const applied =
          active.output !== "ai-feedback" &&
          applySkillOutputToEditor(editorInstance, active.output, payload.text ?? "");
        if (applied) {
          showSkillStatus({ kind: "success", text: `「${active.skillName}」已写入正文` }, 3500);
          // A8: 短暂高亮编辑器，指示正文被修改了（3s 后自动恢复）。
          setSkillHighlightKey((k) => k + 1);
          setTimeout(() => setSkillHighlightKey(0), 3000);
        } else {
          showSkillStatus({ kind: "success", text: `「${active.skillName}」已写入时间线` }, 3500);
          if (chapter) {
            void queryClient.invalidateQueries({ queryKey: ["feedbacks", chapter.id] });
          }
        }
      } else if (payload.status === "failed") {
        showSkillStatus({
          kind: "error",
          text: `「${active.skillName}」失败：${friendlyErrorMessage(payload.error, "技能运行失败，请稍后重试。")}`,
        });
      } else if (payload.status === "cancelled") {
        showSkillStatus({ kind: "success", text: `「${active.skillName}」已取消` }, 3500);
      }
      activeSkillRunRef.current = null;
    });
    return () => offDone();
  }, [chapter, queryClient, editorInstance, showSkillStatus]);

  const runManualSkill = async (skill: SkillDefinition) => {
    if (!chapter) return;
    setSkillMenuOpen(false);
    showSkillStatus({ kind: "busy", text: `「${skill.name}」运行中…` });
    // 用变量定义的默认值组装 manualVariables，让 {{vars.xxx}} 在手动运行时也能取到值。
    const manualVariables: Record<string, string> = {};
    for (const v of skill.variables ?? []) {
      if (v.defaultValue !== undefined) manualVariables[v.key] = v.defaultValue;
    }
    try {
      const response = await skillApi.run({
        skillId: skill.id,
        projectId: chapter.projectId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterText: content,
        triggerType: "manual",
        manualVariables: Object.keys(manualVariables).length > 0 ? manualVariables : undefined,
        // 非时间线输出无需落库，避免重复（结果会直接写进正文）。
        persist: skill.output === "ai-feedback",
      });
      activeSkillRunRef.current = { runId: response.runId, skillName: skill.name, output: skill.output };
    } catch (err) {
      showSkillStatus({
        kind: "error",
        text: `「${skill.name}」启动失败：${friendlyErrorMessage(err, "技能启动失败，请稍后重试。")}`,
      });
    }
  };

  const editorWidthClass = settings.editorWidth === "narrow" ? "max-w-2xl" : settings.editorWidth === "wide" ? "max-w-5xl" : "max-w-3xl";
  const focusMode = settings.focusMode;
  const patchSettings = useAppStore((s) => s.patchSettings);
  const setSettings = useAppStore((s) => s.setSettings);
  const persistEditorSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      patchSettings(updates);
      void settingsApi.set({ updates }).then(setSettings).catch(() => {});
    },
    [patchSettings, setSettings],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        persistEditorSettings({ focusMode: !focusMode });
      }
      if (e.key === "Escape" && focusMode) {
        persistEditorSettings({ focusMode: false });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, persistEditorSettings]);

  useEffect(() => {
    if (!lastSavedAt || savePhase !== "saved") return;
    const timer = window.setInterval(() => setSaveStatusNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [lastSavedAt, savePhase]);
  const saveStatusLabel = useMemo(() => {
    if (savePhase === "saving") return "保存中…";
    if (savePhase === "queued") return "等待保存";
    if (savePhase === "error") return `保存失败${saveError ? `：${saveError}` : ""}`;
    if (!lastSavedAt) return "已保存";
    const seconds = Math.max(0, Math.round((saveStatusNow - lastSavedAt) / 1000));
    if (seconds < 5) return "刚刚保存";
    if (seconds < 60) return `${seconds} 秒前保存`;
    return `${Math.floor(seconds / 60)} 分钟前保存`;
  }, [lastSavedAt, saveError, savePhase, saveStatusNow]);

  const displayedTransientStatus = skillStatus ?? exportStatus;
  const displayedStatusTone: StatusTone =
    displayedTransientStatus?.kind ??
    (savePhase === "error"
      ? "error"
      : savePhase === "saving" || savePhase === "queued"
        ? "busy"
        : "neutral");
  const displayedStatusPhase: SavePhase =
    displayedStatusTone === "error" ? "error" : displayedStatusTone === "busy" ? "saving" : "saved";
  const saveStatusClass =
    displayedStatusTone === "error"
      ? "text-red-300"
      : displayedStatusTone === "success"
        ? "text-emerald-300"
      : displayedStatusTone === "busy"
        ? "text-accent-300"
        : "text-ink-500";
  const displayedStatusLabel = displayedTransientStatus?.text ?? saveStatusLabel;
  const cursorStatusLabel = cursorState.selectedGraphemes > 0
    ? `已选 ${cursorState.selectedGraphemes} 字`
    : `第 ${cursorState.lineNumber} 行 · 本段 ${cursorState.paragraphGraphemes} 字`;

  const handleSnapshotRestored = useCallback(
    (response: SnapshotRestoreResponse) => {
      if (!chapter) return;
      setEditorContent(response.chapterContent, chapter.id);
      queryClient.setQueryData<ChapterReadResponse | null>(
        ["chapter-content", chapter.id],
        (current) => (current ? { ...current, content: response.chapterContent } : current),
      );
      queryClient.setQueryData(
        ["chapter-heading-outline", chapter.id],
        extractChapterHeadings(chapter.id, response.chapterContent),
      );
      lastSavedRef.current = response.chapterContent;
      lastAutosavedRef.current = response.chapterContent;
      setSavePhase("saved");
      setSaveError(null);
      setLastSavedAt(Date.now());
      setRecoveryPrompt(null);
      setSnapshotMenuOpen(false);
      void chapterApi.autosaveClear({ id: chapter.id }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ["chapter-content", chapter.id] });
      void queryClient.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["daily-progress", chapter.projectId] });
    },
    [chapter, queryClient, setEditorContent],
  );

  if (!chapter) {
    return (
      <EmptyState
        icon={<PenLine className="h-10 w-10" />}
        title="开始你的第一章"
        description="左侧可新建、导入或拖入章节。选中一章即可进入沉浸式写作，停笔后会出现写作建议。"
        action={
          onCreateChapter
            ? {
                label: creatingChapter ? "新建中…" : "新建本章",
                onClick: onCreateChapter,
                disabled: creatingChapter,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className={`flex min-h-12 items-center justify-between gap-3 border-b border-ink-700 bg-ink-800/70 px-4 py-2.5 text-sm transition-opacity duration-200 ${focusMode ? "opacity-40 hover:opacity-100 focus-within:opacity-100" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="min-w-0 truncate font-semibold" title={chapter.title}>{chapter.title}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs text-ink-300">
          <span className="hidden text-ink-400 lg:inline">汉字 {stats.chinese} · 词 {stats.words}</span>
          <span className="hidden max-w-40 truncate text-ink-500 xl:inline" title={cursorStatusLabel}>{cursorStatusLabel}</span>
          {/* 工具栏改纯图标 + 原生悬浮提示(title)，按功能分组用竖线分隔：整体更轻、窄窗也放得下。 */}
          {/* v20: 显式撤回/重做（覆盖手输 / 黏贴 / AI 润色，所有 TipTap 事务都计入 history） */}
          <div className="flex items-center gap-0.5">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="撤回（Ctrl+Z）— 包括手输、黏贴、模型润色"
              title="撤回 · Ctrl+Z"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { undo?: () => boolean };
                } | null;
                e?.commands?.undo?.();
              }}
              disabled={!editorInstance}
            >
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="重做（Ctrl+Shift+Z）"
              title="重做 · Ctrl+Shift+Z"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { redo?: () => boolean };
                } | null;
                e?.commands?.redo?.();
              }}
              disabled={!editorInstance}
            >
              <RotateCw className="h-4 w-4" />
            </IconButton>
          </div>
          <Divider orientation="vertical" className="mx-0.5 h-5 self-center" />
          <EditorInsertMenu
            disabled={!editorInstance}
            onInsertHeading={insertHeading}
            onInsertSceneBreak={insertSceneBreak}
            onInsertIndent={insertFullWidthIndent}
            onInsertTodo={insertTodoMarker}
            onNormalizeSelection={normalizeCurrentSelection}
          />
          <EditorAppearanceMenu settings={settings} onChange={persistEditorSettings} />
          <ManualChapterMapMenu
            items={chapterMapItems}
            currentLine={cursorState.lineNumber || currentEditorLine()}
            focusMode={focusMode}
            onJumpItem={jumpToChapterMapItem}
          />
          <IconButton
            size="sm"
            variant={findOpen ? "accentSoft" : "ghost"}
            aria-label="查找正文（Ctrl+F）"
            title="查找正文 · Ctrl+F"
            aria-pressed={findOpen}
            onClick={() => setFindOpen((v) => !v)}
          >
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="保存（Ctrl+S）"
            title="保存 · Ctrl+S"
            onClick={handleManualSave}
          >
            <Save className="h-4 w-4" />
          </IconButton>
          <div ref={snapshotMenuRef} className="relative">
            <IconButton
              size="sm"
              variant={snapshotMenuOpen ? "accentSoft" : "ghost"}
              aria-label="章节版本备份：手动备份 / 还原历史版本"
              title="版本备份 / 还原"
              aria-pressed={snapshotMenuOpen}
              onClick={() => setSnapshotMenuOpen((v) => !v)}
            >
              <Archive className="h-4 w-4" />
            </IconButton>
            <AnimatePresence initial={false}>
              {snapshotMenuOpen && (
                <motion.div
                  className="absolute right-0 top-full z-40 mt-2"
                  {...slimDropIn}
                >
                  <SnapshotMenu
                    chapterId={chapter.id}
                    projectId={chapter.projectId}
                    onBeforeSnapshotAction={flushCurrentContent}
                    onRestored={handleSnapshotRestored}
                    onClose={() => setSnapshotMenuOpen(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="导出为 Markdown 文件"
            title="导出为 Markdown"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
          </IconButton>
          <Divider orientation="vertical" className="mx-0.5 h-5 self-center" />
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="分析本章"
            title="分析本章"
            onClick={handleManualAnalyze}
          >
            <RefreshCw className="h-4 w-4" />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="选择大纲卡并进入 AI 写作"
            title="从大纲进入 AI 写作"
            onClick={() => setOutlineDialogOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
          </IconButton>
          <div ref={skillMenuRef} className="relative">
            <IconButton
              size="sm"
              variant={skillMenuOpen ? "accentSoft" : "ghost"}
              aria-label={
                manualSkills.length === 0
                  ? "暂无可手动运行的技能（可在技能页创建或启用「手动触发」）"
                  : "运行一个技能"
              }
              title={manualSkills.length === 0 ? "暂无可手动运行的技能" : "运行技能"}
              aria-pressed={skillMenuOpen}
              onClick={() => setSkillMenuOpen((v) => !v)}
              disabled={manualSkills.length === 0}
            >
              <Puzzle className="h-4 w-4" />
            </IconButton>
            <AnimatePresence initial={false}>
              {skillMenuOpen && manualSkills.length > 0 && (
                <motion.div
                  className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 py-1 text-xs shadow-xl backdrop-blur"
                  {...slimDropIn}
                >
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-500">
                    手动触发
                  </div>
                  {manualSkills.map((skill) => (
                    <button
                      key={skill.id}
                      className="block w-full truncate px-3 py-1.5 text-left hover:bg-ink-700/60"
                      onClick={() => void runManualSkill(skill)}
                      title={skill.prompt.slice(0, 120)}
                    >
                      {skill.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* C7: TTS 朗读器 */}
          <ReadAloud text={content} />
          {focusMode && chapterHeadings.length > 0 ? (
            <div className="hidden items-center gap-1 rounded-md border border-ink-700/70 bg-ink-900/70 px-1 py-0.5 xl:flex">
              <IconButton
                size="xs"
                variant="ghost"
                aria-label={"\u8df3\u5230\u4e0a\u4e00\u4e2a\u6807\u9898"}
                title={"\u4e0a\u4e00\u4e2a\u6807\u9898"}
                onClick={() => jumpHeading("previous")}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconButton>
              <span className="max-w-32 truncate text-[11px] text-ink-400" title={currentHeading?.title ?? ""}>
                {currentHeading?.title ?? "\u6807\u9898"}
              </span>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label={"\u8df3\u5230\u4e0b\u4e00\u4e2a\u6807\u9898"}
                title={"\u4e0b\u4e00\u4e2a\u6807\u9898"}
                onClick={() => jumpHeading("next")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ) : null}
          <Divider orientation="vertical" className="mx-0.5 h-5 self-center" />
          <SaveStatusIndicator
            phase={displayedStatusPhase}
            label={displayedStatusLabel}
            className={saveStatusClass}
            title={displayedStatusLabel}
            tone={displayedStatusTone}
            reduceMotion={shouldReduceMotion}
          />
          <Divider orientation="vertical" className="mx-0.5 h-5 self-center" />
          <IconButton
            size="sm"
            variant={focusMode ? "accentSoft" : "ghost"}
            aria-label={focusMode ? "退出专注模式（F11）" : "进入专注模式（F11）"}
            title="专注模式 · F11"
            aria-pressed={focusMode}
            onClick={() => persistEditorSettings({ focusMode: !focusMode })}
          >
            <Focus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <ChapterWorkflowBar
        focusMode={focusMode}
        graphemes={stats.graphemes}
        linkedOutlineCard={linkedOutlineCard}
        onReviewChapter={() => flowActions.reviewChapter(chapter.id)}
        onAutoWriteChapter={() => flowActions.autoWriteChapter(chapter.id)}
        onResearchChapter={() => flowActions.researchChapter(chapter.id, chapterResearchQuery)}
        onOpenOutlineCard={() => {
          if (linkedOutlineCard) flowActions.openOutline(linkedOutlineCard.id);
        }}
      />
      <ManualWritingRhythmBar
        focusMode={focusMode}
        sessionAddedGraphemes={sessionAddedGraphemes}
        activeDurationMs={activeWritingMs}
        sessionGoal={rhythmState.sessionGoal}
        nextBeat={rhythmState.nextBeat}
        resumeCue={resumeCue}
        onNextBeatChange={handleNextBeatChange}
        onSessionGoalChange={handleSessionGoalChange}
        onInsertNextBeatTodo={handleInsertNextBeatTodo}
        onClearNextBeat={handleClearNextBeat}
        onJumpToResumeCue={handleJumpToResumeCue}
      />
      <AnimatePresence initial={false}>
        {findOpen && (
          <motion.div {...slimDropIn}>
            <EditorFindBar
              inputRef={findInputRef}
              findText={findText}
              setFindText={setFindText}
              replaceText={replaceText}
              setReplaceText={setReplaceText}
              options={findOptions}
              onOptionsChange={setFindOptions}
              matchCount={findMatches.length}
              activeIndex={Math.min(activeFindIndex, Math.max(0, findMatches.length - 1))}
              status={findStatus}
              replaceConfirm={replaceConfirm}
              runFind={runFind}
              onReplaceCurrent={replaceCurrentMatch}
              onReplaceAll={replaceAllMatches}
              onClose={() => {
                setFindOpen(false);
                setReplaceConfirm(false);
                setFindStatus(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <div className={`mx-auto ${editorWidthClass} px-8 py-8`}>
          <AnimatePresence initial={false}>
            {recoveryPrompt && (
              <motion.div {...softLiftIn}>
                <RecoveryPromptBanner
                  recoveryPrompt={recoveryPrompt}
                  onRestore={(text) => {
                    setEditorContent(text, chapter.id);
                    setSavePhase("queued");
                    showExportStatus({ kind: "success", text: "已恢复自动备份，等待保存" }, 3500);
                    setRecoveryPrompt(null);
                  }}
                  onDiscard={() => {
                    void chapterApi.autosaveClear({ id: chapter.id }).catch(() => {});
                    setRecoveryPrompt(null);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {/* A8: skill 写入正文后短暂高亮编辑区（环形光晕+3s淡出） */}
          <div
            className={skillHighlightKey > 0 ? "skill-highlight-active" : ""}
            style={
              skillHighlightKey > 0
                ? {
                    animation: "skill-glow 3s ease-out forwards",
                  }
                : undefined
            }
          >
            <NovelEditor
              key={chapter?.id ?? "empty"}
              value={content}
              onChange={(text) => setEditorContent(text, chapter.id)}
              placeholder="在这里写下第一行……"
              autofocus
              onEditorReady={handleEditorReady}
              autoIndent={settings.autoIndent}
              typewriterMode={settings.typewriterMode}
              fontSize={settings.editorFontSize}
              lineHeight={settings.editorLineHeight}
              spellcheck={settings.spellcheck}
            />
          </div>
        </div>
      </div>
      <SelectionToolbar
        editor={editorInstance}
        providerId={resolvedProviderId}
        projectId={chapter.projectId}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        onPushFeedback={() => {
          void queryClient.invalidateQueries({ queryKey: ["feedbacks", chapter.id] });
        }}
        onAfterApply={() => {
          // Editor's onUpdate drives content state; debounce save kicks in.
        }}
      />
      <InspirationBubble
        editor={editorInstance}
        providerId={resolvedProviderId}
        projectId={chapter.projectId}
        chapterId={chapter.id}
      />
      <AnimatePresence initial={false}>
        {focusMode && (
          <motion.div {...softLiftIn}>
            <FocusDraftBoard chapterId={chapter.id} projectId={chapter.projectId} />
          </motion.div>
        )}
      </AnimatePresence>
      {chapter ? (
        <ChapterFromOutlineDialog
          chapter={chapter}
          open={outlineDialogOpen}
          onClose={() => setOutlineDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
