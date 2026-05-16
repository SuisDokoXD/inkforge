import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChapterRecord, ProviderRecord, SkillDefinition } from "@inkforge/shared";
import { computeWordStats } from "@inkforge/shared";
import { NovelEditor, computeWordCount, useAnalysisTrigger } from "@inkforge/editor";
import type { Editor } from "@tiptap/react";
import { chapterApi, fsApi, llmApi, skillApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { SelectionToolbar } from "./SelectionToolbar";
import { InspirationBubble } from "./InspirationBubble";
import { ChapterFromOutlineDialog } from "./ChapterFromOutlineDialog";

interface EditorPaneProps {
  chapter: ChapterRecord | null;
  providers: ProviderRecord[];
}

export function EditorPane({ chapter, providers }: EditorPaneProps): JSX.Element {
  const queryClient = useQueryClient();
  const settings = useAppStore((s) => s.settings);
  const activeProviderId = settings.activeProviderId;
  const analysisEnabled = settings.analysisEnabled;
  const analysisThreshold = settings.analysisThreshold;

  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false);
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
  const activeSkillRunRef = useRef<{ runId: string; skillName: string } | null>(null);
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

  const saveMutation = useMutation({
    mutationFn: (payload: { content: string; wordCount: number }) => {
      if (!chapter) return Promise.reject(new Error("No chapter"));
      return chapterApi.update({
        id: chapter.id,
        wordCount: payload.wordCount,
        content: payload.content,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chapters"] });
      if (chapter) {
        void queryClient.invalidateQueries({ queryKey: ["daily-progress", chapter.projectId] });
        void chapterApi.autosaveClear({ id: chapter.id }).catch(() => {});
      }
    },
  });

  useEffect(() => {
    if (!chapter || !loaded) return;
    if (content === lastSavedRef.current) return;
    const handle = setTimeout(() => {
      lastSavedRef.current = content;
      saveMutation.mutate({ content, wordCount: stats.graphemes });
    }, 1200);
    return () => clearTimeout(handle);
  }, [content, chapter, loaded, stats.graphemes, saveMutation]);

  const handleManualSave = useCallback(() => {
    if (!chapter || !loaded) return;
    if (content === lastSavedRef.current) return;
    lastSavedRef.current = content;
    saveMutation.mutate({ content, wordCount: stats.graphemes });
  }, [chapter, loaded, content, stats.graphemes, saveMutation]);

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

  // Disk-autosave sidecar every ~5s while typing. Runs in parallel to the 1.2s
  // DB save so that a crash between DB saves still leaves a recoverable copy.
  useEffect(() => {
    if (!chapter || !loaded) return;
    if (content === lastAutosavedRef.current) return;
    const handle = setTimeout(() => {
      const snapshot = content;
      void chapterApi
        .autosaveWrite({ id: chapter.id, content: snapshot })
        .then(() => {
          lastAutosavedRef.current = snapshot;
        })
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(handle);
  }, [content, chapter, loaded]);

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
      setExportStatus(`导出失败：${err instanceof Error ? err.message : String(err)}`);
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
    const offDone = skillApi.onDone((payload) => {
      const active = activeSkillRunRef.current;
      if (!active || payload.runId !== active.runId) return;
      if (payload.status === "completed") {
        setSkillStatus(`「${active.skillName}」已写入时间线`);
        if (chapter) {
          void queryClient.invalidateQueries({ queryKey: ["feedbacks", chapter.id] });
        }
      } else if (payload.status === "failed") {
        setSkillStatus(`「${active.skillName}」失败：${payload.error ?? "unknown"}`);
      } else if (payload.status === "cancelled") {
        setSkillStatus(`「${active.skillName}」已取消`);
      }
      activeSkillRunRef.current = null;
      window.setTimeout(() => setSkillStatus(null), 3500);
    });
    return () => offDone();
  }, [chapter, queryClient]);

  const runManualSkill = async (skill: SkillDefinition) => {
    if (!chapter) return;
    setSkillMenuOpen(false);
    setSkillStatus(`「${skill.name}」运行中…`);
    try {
      const response = await skillApi.run({
        skillId: skill.id,
        projectId: chapter.projectId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterText: content,
        triggerType: "manual",
      });
      activeSkillRunRef.current = { runId: response.runId, skillName: skill.name };
    } catch (err) {
      setSkillStatus(
        `「${skill.name}」启动失败：${err instanceof Error ? err.message : String(err)}`,
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

  if (!chapter) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        选一章开始创作，或在左侧新建。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center justify-between border-b border-ink-700 bg-ink-800/50 px-6 py-2 text-sm transition-opacity duration-300 ${focusMode ? "opacity-0 hover:opacity-100" : ""}`}>
        <div className="flex items-center gap-3">
          <span className="font-medium">{chapter.title}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-300">
          <span>汉字 {stats.chinese}</span>
          <span>词 {stats.words}</span>
          <span>合计 {stats.graphemes}</span>
          {/* v20: 显式撤回/重做按钮（覆盖手输 / 黏贴 / AI 润色，所有 TipTap 事务都计入 history） */}
          <div className="flex items-center gap-0.5">
            <button
              className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-40"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { undo?: () => boolean };
                } | null;
                e?.commands?.undo?.();
              }}
              disabled={!editorInstance}
              title="撤回（Ctrl+Z）— 包括手输、黏贴、AI 润色"
            >
              ↶ 撤回
            </button>
            <button
              className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-40"
              onClick={() => {
                const e = editorInstance as unknown as {
                  commands?: { redo?: () => boolean };
                } | null;
                e?.commands?.redo?.();
              }}
              disabled={!editorInstance}
              title="重做（Ctrl+Shift+Z）"
            >
              ↷ 重做
            </button>
          </div>
          <button
            className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleManualSave}
            title="保存（Ctrl+S）"
          >
            保存
          </button>
          <button
            className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleExport}
            title="导出为 Markdown 文件"
          >
            导出
          </button>
          <button
            className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={handleManualAnalyze}
          >
            手动分析
          </button>
          <button
            className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
            onClick={() => setOutlineDialogOpen(true)}
            title="基于章节大纲卡 AI 生成本章正文"
          >
            📋 从大纲生成
          </button>
          <div ref={skillMenuRef} className="relative">
            <button
              className="flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-50"
              onClick={() => setSkillMenuOpen((v) => !v)}
              disabled={manualSkills.length === 0}
              title={
                manualSkills.length === 0
                  ? "暂无可手动运行的 Skill（去 Skill 页创建或启用「手动触发」）"
                  : "运行一个 Skill"
              }
            >
              跑 Skill
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
          <span className="text-ink-500">
            {skillStatus ??
              exportStatus ??
              (saveMutation.isPending
                ? "保存中…"
                : saveMutation.isError
                  ? "保存失败"
                  : "已保存")}
          </span>
          <button
            className={`rounded-md border px-2 py-1 text-xs hover:bg-ink-700 ${focusMode ? "border-amber-500 text-amber-400" : "border-ink-600"}`}
            onClick={() => patchSettings({ focusMode: !focusMode })}
            title="专注模式（F11）"
          >
            {focusMode ? "退出专注" : "专注"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <div className={`mx-auto ${editorWidthClass} px-8 py-8`}>
          {recoveryPrompt && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-600/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
              <div>
                检测到未保存的自动备份（{new Date(recoveryPrompt.savedAt).toLocaleString()}），
                可能来自上次异常退出。是否恢复？
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="rounded border border-amber-500 px-2 py-0.5 hover:bg-amber-800/40"
                  onClick={() => {
                    if (!recoveryPrompt) return;
                    setContent(recoveryPrompt.content);
                    setRecoveryPrompt(null);
                  }}
                >
                  恢复
                </button>
                <button
                  className="rounded border border-ink-600 px-2 py-0.5 hover:bg-ink-700"
                  onClick={() => {
                    if (!chapter) return;
                    void chapterApi.autosaveClear({ id: chapter.id }).catch(() => {});
                    setRecoveryPrompt(null);
                  }}
                >
                  丢弃
                </button>
              </div>
            </div>
          )}
          <NovelEditor
            key={chapter?.id ?? "empty"}
            value={content}
            onChange={(text) => setContent(text)}
            placeholder="在这里写下第一行……"
            onEditorReady={handleEditorReady}
            autoIndent={settings.autoIndent}
            typewriterMode={settings.typewriterMode}
            fontSize={settings.editorFontSize}
            lineHeight={settings.editorLineHeight}
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
