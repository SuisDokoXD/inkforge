import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  ChapterRecord,
  ChapterReadResponse,
  OutlineCardRecord,
  ProviderRecord,
  SkillDefinition,
  SkillOutputTarget,
  SnapshotRestoreResponse,
} from "@inkforge/shared";
import { computeWordStats } from "@inkforge/shared";
import { NovelEditor, computeWordCount, useAnalysisTrigger } from "@inkforge/editor";
import type { Editor } from "@tiptap/react";
import {
  Archive,
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
import { chapterApi, fsApi, llmApi, outlineApi, skillApi, snapshotApi } from "../lib/api";
import { applySkillOutputToEditor } from "../lib/skill-output";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { DUR, EASE_IN_OUT, EASE_STANDARD, fadeOnly } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { SelectionToolbar } from "./SelectionToolbar";
import { InspirationBubble } from "./InspirationBubble";
import { ChapterFromOutlineDialog } from "./ChapterFromOutlineDialog";
import { EmptyState } from "./EmptyState";
import { SnapshotMenu } from "./snapshot";
import { ChapterWorkflowBar } from "./editor/ChapterWorkflowBar";
import { EditorFindBar } from "./editor/EditorFindBar";
import { FocusDraftBoard } from "./editor/FocusDraftBoard";
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
  // A8: skill 写入编辑器后的段落高亮——存被修改的文本范围，3s 后自动清除。
  const [skillHighlightKey, setSkillHighlightKey] = useState<number>(0);
  const [savePhase, setSavePhase] = useState<SavePhase>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
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
  const setEditorContent = useCallback((nextContent: string, chapterId?: string | null) => {
    contentRef.current = nextContent;
    if (chapterId) {
      contentCacheRef.current.set(chapterId, nextContent);
    }
    setContent(nextContent);
  }, []);
  const handleEditorReady = useCallback((editor: Editor | null) => {
    setEditorInstance(editor);
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
  }, [readQuery.data, chapter, setEditorContent]);

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
    setSavePhase("saved");
    setSaveError(null);
    setLastSavedAt(
      readQuery.data.chapter.updatedAt ? new Date(readQuery.data.chapter.updatedAt).getTime() : Date.now(),
    );
    setRecoveryPrompt(null);
  }, [chapter, loaded, readQuery.data, setEditorContent]);

  useEffect(() => { contentRef.current = content; }, [content]);

  // 字数统计仅用于显示（编辑器工具栏 / 状态栏 / 工作流栏阈值），不参与保存时的真实字数
  // 计算（保存路径在落盘时另算 computeWordCount）。computeWordCount + computeWordStats 会
  // 对全文做多趟 Intl.Segmenter / 正则扫描，长章节里每次按键都重算会拖慢输入手感；这里把
  // 统计去抖到停顿 250ms 之后再算，让按键热路径保持轻量，显示值停顿后刷新。
  const statsText = useDebouncedValue(content, 250);
  const stats = useMemo(() => computeWordCount(statsText), [statsText]);
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
          void queryClient.invalidateQueries({ queryKey: ["chapters", request.projectId] });
          void queryClient.invalidateQueries({ queryKey: ["daily-progress", request.projectId] });
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
  }, [queryClient]);

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
      // C3: 手动保存后自动创建快照（fire-and-forget）
      if (chapter) {
        void snapshotApi.create({
          chapterId: chapter.id,
          projectId: chapter.projectId,
          kind: "manual",
          label: `保存 · ${new Date().toLocaleTimeString("zh-CN")}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [flushCurrentContent, chapter]);

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
    }, 80);
    return () => window.clearTimeout(timer);
  }, [chapter, editorInstance, headingJumpTarget, jumpEditorToText, loaded]);

  const runFind = useCallback(
    (backwards = false) => {
      const term = findText.trim();
      if (!term) return;
      editorInstance?.commands.focus();
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
      finder?.(term, false, backwards, true, false, false, false);
    },
    [editorInstance, findText],
  );

  useEffect(() => {
    if (!findOpen) return;
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  }, [findOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
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

  const handleManualAnalyze = () => {
    if (!chapter) return;
    // 手动分析：仅对齐基线（不要再调 forceTrigger，否则会和下面的 manual 调用
    // 重复放一炮）；随后直接发一次 trigger:"manual" 的分析。
    rebaseline();
    activeAnalysisChapterRef.current = chapter.id;
    void llmApi.analyze({
      projectId: chapter.projectId,
      chapterId: chapter.id,
      chapterText: content,
      providerId: resolvedProviderId,
      trigger: "manual",
    });
  };

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        patchSettings({ focusMode: !focusMode });
      }
      if (e.key === "Escape" && focusMode) {
        patchSettings({ focusMode: false });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, patchSettings]);

  const saveStatusLabel = useMemo(() => {
    if (savePhase === "saving") return "保存中…";
    if (savePhase === "queued") return "等待保存";
    if (savePhase === "error") return `保存失败${saveError ? `：${saveError}` : ""}`;
    if (!lastSavedAt) return "已保存";
    const seconds = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    if (seconds < 5) return "刚刚保存";
    if (seconds < 60) return `${seconds} 秒前保存`;
    return `${Math.floor(seconds / 60)} 分钟前保存`;
  }, [lastSavedAt, saveError, savePhase]);

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

  const handleSnapshotRestored = useCallback(
    (response: SnapshotRestoreResponse) => {
      if (!chapter) return;
      setEditorContent(response.chapterContent, chapter.id);
      queryClient.setQueryData<ChapterReadResponse | null>(
        ["chapter-content", chapter.id],
        (current) => (current ? { ...current, content: response.chapterContent } : current),
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
      <div className={`flex min-h-12 items-center justify-between gap-3 border-b border-ink-700 bg-ink-800/70 px-4 py-2.5 text-sm transition-opacity duration-300 ${focusMode ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="min-w-0 truncate font-semibold" title={chapter.title}>{chapter.title}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs text-ink-300">
          <span className="hidden text-ink-400 lg:inline">汉字 {stats.chinese} · 词 {stats.words}</span>
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
            onClick={() => patchSettings({ focusMode: !focusMode })}
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
      <AnimatePresence initial={false}>
        {findOpen && (
          <motion.div {...slimDropIn}>
            <EditorFindBar
              inputRef={findInputRef}
              findText={findText}
              setFindText={setFindText}
              runFind={runFind}
              onClose={() => setFindOpen(false)}
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
