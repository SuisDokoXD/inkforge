import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterRecord,
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
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { chapterApi, fsApi, llmApi, outlineApi, skillApi } from "../lib/api";
import { applySkillOutputToEditor } from "../lib/skill-output";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { SelectionToolbar } from "./SelectionToolbar";
import { InspirationBubble } from "./InspirationBubble";
import { ChapterFromOutlineDialog } from "./ChapterFromOutlineDialog";
import { EmptyState } from "./EmptyState";
import { SnapshotMenu } from "./snapshot";
import { ChapterWorkflowBar } from "./editor/ChapterWorkflowBar";
import { EditorFindBar } from "./editor/EditorFindBar";
import { FocusDraftBoard } from "./editor/FocusDraftBoard";
import { RecoveryPromptBanner } from "./editor/RecoveryPromptBanner";

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

interface SaveRequest {
  chapterId: string;
  projectId: string;
  content: string;
  wordCount: number;
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

  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false);
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
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
  const handleEditorReady = useCallback((editor: Editor | null) => {
    setEditorInstance(editor);
  }, []);

  const readQuery = useQuery({
    queryKey: ["chapter-content", chapter?.id],
    queryFn: () => (chapter ? chapterApi.read({ id: chapter.id }) : Promise.resolve(null)),
    enabled: !!chapter,
  });

  useEffect(() => {
    if (!chapter) {
      setContent("");
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
      setContent(initialContent);
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
  }, [readQuery.data, chapter]);

  useEffect(() => { contentRef.current = content; }, [content]);

  const stats = useMemo(() => computeWordCount(content), [content]);
  const setCurrentChapterStats = useAppStore((s) => s.setCurrentChapterStats);

  useEffect(() => {
    if (!chapter) {
      setCurrentChapterStats(null);
      return;
    }
    const ws = computeWordStats(content);
    setCurrentChapterStats({
      cjk: ws.cjk,
      en: ws.en,
      tokens: ws.tokens,
      graphemes: stats.graphemes,
    });
  }, [content, chapter, stats.graphemes, setCurrentChapterStats]);

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
          await chapterApi.update({
            id: request.chapterId,
            wordCount: request.wordCount,
            content: request.content,
          });
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
    }, 1200);
    return () => clearTimeout(handle);
  }, [content, chapter, loaded, queueSave]);

  const handleManualSave = useCallback(() => {
    void flushCurrentContent().catch(() => {});
  }, [flushCurrentContent]);

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
        editorInstance.chain().focus().setTextSelection(found).scrollIntoView().run();
        return true;
      }
    }
    return false;
  }, [editorInstance]);

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

  const resolvedProviderId = useMemo(() => {
    if (activeProviderId && providers.some((p) => p.id === activeProviderId)) return activeProviderId;
    return providers[0]?.id;
  }, [activeProviderId, providers]);

  const { forceTrigger } = useAnalysisTrigger({
    text: content,
    threshold: analysisThreshold,
    debounceMs: 10_000,
    language: "zh",
    enabled: loaded && analysisEnabled,
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
    setExportStatus("导出中…");
    try {
      const exportResult = await chapterApi.exportMd({ id: chapter.id });
      const result = await fsApi.saveFile({
        defaultPath: exportResult.fileName,
        content: exportResult.content,
      });
      if (result.path) setExportStatus("已导出");
      else setExportStatus(null);
    } catch (err) {
      setExportStatus(`导出失败：${friendlyErrorMessage(err, "导出失败，请稍后重试。")}`);
    }
    setTimeout(() => setExportStatus(null), 3000);
  };

  const handleManualAnalyze = () => {
    if (!chapter) return;
    forceTrigger();
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
          setSkillStatus(`「${active.skillName}」已写入正文`);
        } else {
          setSkillStatus(`「${active.skillName}」已写入时间线`);
          if (chapter) {
            void queryClient.invalidateQueries({ queryKey: ["feedbacks", chapter.id] });
          }
        }
      } else if (payload.status === "failed") {
        setSkillStatus(
          `「${active.skillName}」失败：${friendlyErrorMessage(payload.error, "技能运行失败，请稍后重试。")}`,
        );
      } else if (payload.status === "cancelled") {
        setSkillStatus(`「${active.skillName}」已取消`);
      }
      activeSkillRunRef.current = null;
      window.setTimeout(() => setSkillStatus(null), 3500);
    });
    return () => offDone();
  }, [chapter, queryClient, editorInstance]);

  const runManualSkill = async (skill: SkillDefinition) => {
    if (!chapter) return;
    setSkillMenuOpen(false);
    setSkillStatus(`「${skill.name}」运行中…`);
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
      setSkillStatus(
        `「${skill.name}」启动失败：${friendlyErrorMessage(err, "技能启动失败，请稍后重试。")}`,
      );
      window.setTimeout(() => setSkillStatus(null), 3500);
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

  const saveStatusClass =
    savePhase === "error"
      ? "text-red-300"
      : savePhase === "saving" || savePhase === "queued"
        ? "text-accent-300"
        : "text-ink-500";

  const handleSnapshotRestored = useCallback(
    (response: SnapshotRestoreResponse) => {
      if (!chapter) return;
      setContent(response.chapterContent);
      contentCacheRef.current.set(chapter.id, response.chapterContent);
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
    [chapter, queryClient],
  );

  if (!chapter) {
    return (
      <EmptyState
        icon="✍"
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
      <div className={`flex min-h-11 items-center justify-between gap-3 border-b border-ink-700 bg-ink-800/50 px-4 py-2 text-sm transition-opacity duration-300 ${focusMode ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="min-w-0 truncate font-medium" title={chapter.title}>{chapter.title}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs text-ink-300">
          <span className="hidden text-ink-400 xl:inline">汉字 {stats.chinese} · 词 {stats.words}</span>
          {/* v20: 显式撤回/重做按钮（覆盖手输 / 黏贴 / AI 润色，所有 TipTap 事务都计入 history） */}
          <div className="flex items-center gap-1">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-40"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { undo?: () => boolean };
                } | null;
                e?.commands?.undo?.();
              }}
              disabled={!editorInstance}
              title="撤回（Ctrl+Z）— 包括手输、黏贴、模型润色"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              撤回
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-40"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { redo?: () => boolean };
                } | null;
                e?.commands?.redo?.();
              }}
              disabled={!editorInstance}
              title="重做（Ctrl+Shift+Z）"
            >
              <RotateCw className="h-3.5 w-3.5" />
              重做
            </button>
          </div>
          <button
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-ink-700 ${
              findOpen ? "border-accent-500 text-accent-300" : "border-ink-600"
            }`}
            onClick={() => setFindOpen((v) => !v)}
            title="查找正文（Ctrl+F）"
          >
            <Search className="h-3.5 w-3.5" />
            查找
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleManualSave}
            title="保存（Ctrl+S）"
          >
            <Save className="h-3.5 w-3.5" />
            保存
          </button>
          <div ref={snapshotMenuRef} className="relative">
            <button
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-ink-700 ${
                snapshotMenuOpen ? "border-accent-500 text-accent-300" : "border-ink-600"
              }`}
              onClick={() => setSnapshotMenuOpen((v) => !v)}
              title="章节版本备份：手动备份 / 还原历史版本"
            >
              <Archive className="h-3.5 w-3.5" />
              备份
            </button>
            {snapshotMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2">
                <SnapshotMenu
                  chapterId={chapter.id}
                  projectId={chapter.projectId}
                  onBeforeSnapshotAction={flushCurrentContent}
                  onRestored={handleSnapshotRestored}
                  onClose={() => setSnapshotMenuOpen(false)}
                />
              </div>
            )}
          </div>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleExport}
            title="导出为 Markdown 文件"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleManualAnalyze}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            分析
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={() => setOutlineDialogOpen(true)}
            title="基于章节大纲卡生成本章正文"
          >
            <Sparkles className="h-3.5 w-3.5" />
            大纲生成
          </button>
          <div ref={skillMenuRef} className="relative">
            <button
              className="flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-50"
              onClick={() => setSkillMenuOpen((v) => !v)}
              disabled={manualSkills.length === 0}
              title={
                manualSkills.length === 0
                ? "暂无可手动运行的技能（可在技能页创建或启用「手动触发」）"
                  : "运行一个技能"
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              技能
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {skillMenuOpen && manualSkills.length > 0 && (
              <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-ink-600 bg-ink-800/95 py-1 text-xs shadow-xl backdrop-blur">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-500">
                  手动触发
                </div>
                {manualSkills.map((skill) => (
                  <button
                    key={skill.id}
                    className="block w-full truncate px-3 py-1.5 text-left hover:bg-ink-700"
                    onClick={() => void runManualSkill(skill)}
                    title={skill.prompt.slice(0, 120)}
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={`max-w-56 truncate ${saveStatusClass}`} title={skillStatus ?? exportStatus ?? saveStatusLabel}>
            {skillStatus ?? exportStatus ?? saveStatusLabel}
          </span>
          <button
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-ink-700 ${focusMode ? "border-accent-500 text-accent-400" : "border-ink-600"}`}
            onClick={() => patchSettings({ focusMode: !focusMode })}
            title="专注模式（F11）"
          >
            <Focus className="h-3.5 w-3.5" />
            {focusMode ? "退出专注" : "专注"}
          </button>
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
      {findOpen && (
        <EditorFindBar
          inputRef={findInputRef}
          findText={findText}
          setFindText={setFindText}
          runFind={runFind}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <div className={`mx-auto ${editorWidthClass} px-8 py-8`}>
          {recoveryPrompt && (
            <RecoveryPromptBanner
              recoveryPrompt={recoveryPrompt}
              onRestore={(text) => {
                setContent(text);
                setRecoveryPrompt(null);
              }}
              onDiscard={() => {
                void chapterApi.autosaveClear({ id: chapter.id }).catch(() => {});
                setRecoveryPrompt(null);
              }}
            />
          )}
          <NovelEditor
            key={chapter?.id ?? "empty"}
            value={content}
            onChange={(text) => setContent(text)}
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
      {focusMode && (
        <FocusDraftBoard chapterId={chapter.id} projectId={chapter.projectId} />
      )}
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
