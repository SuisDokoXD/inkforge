import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChapterRecord } from "@inkforge/shared";
import { chapterApi, fsApi, llmApi, outlineApi, projectApi, providerApi, settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useChapterShortcuts } from "../lib/use-app-shortcuts";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { extractChapterHeadings, type ChapterHeadingItem } from "../lib/chapter-headings";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { selectStableChapterList } from "../lib/stable-chapter-list";
import { EditorPane } from "../components/EditorPane";
import { ChapterTree } from "../components/ChapterTree";
import { EditorTabBar } from "../components/editor/EditorTabBar";  // A7
import { AITimeline } from "../components/AITimeline";
import { ChatPanel } from "../components/ChatPanel";
import { TerminalPanel } from "../components/TerminalPanel";
import { StatusBar } from "../components/StatusBar";
import { ProviderSwitcher } from "../components/ProviderSwitcher";
import { ProviderSettingsPanel } from "../components/ProviderSettingsPanel";
import { ExportDialog } from "../components/ExportDialog";
import { PomodoroTimer } from "../components/PomodoroTimer";
import { Timer } from "lucide-react";
import { Button, Tabs } from "../components/ui";

interface HeadingJumpTarget extends ChapterHeadingItem {
  chapterId: string;
  nonce: number;
}

export function WorkspacePage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setProject = useAppStore((s) => s.setProject);
  const setChapter = useAppStore((s) => s.setChapter);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const upsertStreaming = useAppStore((s) => s.upsertStreaming);
  const finishAnalysis = useAppStore((s) => s.finishAnalysis);
  const openSettings = useAppStore((s) => s.openSettings);
  const openProviderPanel = useAppStore((s) => s.openProviderPanel);
  const rightPanel = useAppStore((s) => s.rightPanel);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const terminalHeight = useAppStore((s) => s.terminalHeight);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const setTerminalHeight = useAppStore((s) => s.setTerminalHeight);
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const focusMode = settings.focusMode;
  const terminalEnabled = settings.devModeEnabled;
  // A7: 多标签+分屏
  const openEditorTabs = useAppStore((s) => s.openEditorTabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const splitMode = useAppStore((s) => s.splitMode);
  const openInTab = useAppStore((s) => s.openInTab);
  const setSplitMode = useAppStore((s) => s.setSplitMode);


  const [exportOpen, setExportOpen] = useState(false);
  // C5: Pomodoro 冲刺面板开关
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [headingJumpTarget, setHeadingJumpTarget] = useState<HeadingJumpTarget | null>(null);
  const [chapterActionError, setChapterActionError] = useState<string | null>(null);
  const headingJumpNonceRef = useRef(0);
  const reduceMotion = useReducedMotion() === true;
  const statusMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => projectApi.list() });
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => providerApi.list() });

  const resolvedProjectId = currentProjectId ?? projectsQuery.data?.[0]?.id ?? null;

  useEffect(() => {
    if (!currentProjectId && projectsQuery.data && projectsQuery.data.length > 0) {
      setProject(projectsQuery.data[0].id);
    }
  }, [currentProjectId, projectsQuery.data, setProject]);

  const chaptersQuery = useQuery<ChapterRecord[]>({
    queryKey: ["chapters", resolvedProjectId],
    queryFn: () =>
      resolvedProjectId ? chapterApi.list({ projectId: resolvedProjectId }) : Promise.resolve([]),
    enabled: !!resolvedProjectId,
  });

  const lastStableChaptersRef = useRef<ChapterRecord[]>([]);
  const lastStableChaptersProjectRef = useRef<string | null>(null);
  const chapters = useMemo(() => selectStableChapterList(
    chaptersQuery.data,
    resolvedProjectId,
    chaptersQuery.isFetching,
    {
      projectId: lastStableChaptersProjectRef.current,
      chapters: lastStableChaptersRef.current,
    },
  ), [chaptersQuery.data, chaptersQuery.isFetching, resolvedProjectId]);
  useEffect(() => {
    if (chaptersQuery.data && chaptersQuery.data.length > 0) {
      lastStableChaptersRef.current = chaptersQuery.data;
      lastStableChaptersProjectRef.current = resolvedProjectId;
    }
  }, [chaptersQuery.data, resolvedProjectId]);

  // A3: 大纲关联章节 ID 集合——用于 ChapterTree 显示大纲徽章
  const outlineCardsQuery = useQuery({
    queryKey: ["outline-cards", resolvedProjectId],
    queryFn: () => (resolvedProjectId ? outlineApi.list({ projectId: resolvedProjectId }) : Promise.resolve([])),
    enabled: !!resolvedProjectId,
    staleTime: 60_000,
  });
  const outlineChapterIds = useMemo(
    () => new Set((outlineCardsQuery.data ?? []).filter((c) => c.chapterId).map((c) => c.chapterId!)),
    [outlineCardsQuery.data],
  );
  const headingQueries = useQueries({
    queries: chapters.map((chapter) => ({
      queryKey: ["chapter-heading-outline", chapter.id],
      queryFn: async () => {
        const res = await chapterApi.read({ id: chapter.id });
        return extractChapterHeadings(chapter.id, res.content);
      },
      enabled: !!resolvedProjectId,
      staleTime: 30_000,
    })),
  });
  const headingVersionRef = useRef<Map<string, string>>(new Map());
  const headingCacheRef = useRef<Record<string, ChapterHeadingItem[]>>({});
  useEffect(() => {
    chapters.forEach((chapter) => {
      const version = `${chapter.updatedAt ?? ""}:${chapter.wordCount}`;
      const previous = headingVersionRef.current.get(chapter.id);
      headingVersionRef.current.set(chapter.id, version);
      if (previous !== undefined && previous !== version) {
        void queryClient.invalidateQueries({ queryKey: ["chapter-heading-outline", chapter.id] });
      }
    });
  }, [chapters, queryClient]);
  const chapterHeadings = useMemo(() => {
    const map: Record<string, ChapterHeadingItem[]> = {};
    chapters.forEach((chapter, index) => {
      const nextHeadings = headingQueries[index]?.data;
      if (nextHeadings) headingCacheRef.current[chapter.id] = nextHeadings;
      map[chapter.id] = nextHeadings ?? headingCacheRef.current[chapter.id] ?? [];
    });
    return map;
  }, [chapters, headingQueries]);
  useEffect(() => {
    const liveIds = new Set(chapters.map((chapter) => chapter.id));
    for (const cachedId of Object.keys(headingCacheRef.current)) {
      if (!liveIds.has(cachedId)) delete headingCacheRef.current[cachedId];
    }
  }, [chapters]);
  const currentChapter = useMemo(
    () => chapters.find((c) => c.id === currentChapterId) ?? null,
    [chapters, currentChapterId],
  );

  // A7: 分屏时各面板对应的章节列表
  const splitChapters = useMemo(() => {
    if (!splitMode) return [currentChapter];
    const count = splitMode === "3col" ? 3 : 2;
    // right column: next tab; third column: tab after that
    const result: (ChapterRecord | null)[] = [currentChapter];
    for (let i = 1; i < count; i++) {
      const tabId = openEditorTabs[activeTabIndex + i];
      result.push(tabId ? (chapters.find((c) => c.id === tabId) ?? null) : null);
    }
    return result;
  }, [splitMode, currentChapter, openEditorTabs, activeTabIndex, chapters]);

  useEffect(() => {
    if (chapters.length === 0) return;
    if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId)) {
      setChapter(chapters[0].id);
    }
  }, [chapters, currentChapterId, setChapter]);

  useEffect(() => {
    if (!terminalEnabled && terminalOpen) toggleTerminal(false);
  }, [terminalEnabled, terminalOpen, toggleTerminal]);

  useEffect(() => {
    if (headingJumpTarget && headingJumpTarget.chapterId !== currentChapterId) return;
    if (!headingJumpTarget) return;
    const exists = chapterHeadings[headingJumpTarget.chapterId]?.some((item) => item.id === headingJumpTarget.id);
    if (!exists) setHeadingJumpTarget(null);
  }, [chapterHeadings, currentChapterId, headingJumpTarget]);

  useEffect(() => {
    const offChunk = llmApi.onChunk((payload) => {
      upsertStreaming({
        analysisId: payload.analysisId,
        projectId: payload.projectId,
        chapterId: payload.chapterId,
        providerId: payload.providerId,
        status: "streaming",
        accumulatedText: payload.accumulatedText,
        startedAt: payload.emittedAt,
      });
    });
    const offDone = llmApi.onDone((payload) => {
      finishAnalysis(payload.analysisId, payload.status, {
        feedback: payload.feedback,
        error: payload.error,
        providerId: payload.providerId,
      });
    });
    return () => {
      offChunk();
      offDone();
    };
  }, [upsertStreaming, finishAnalysis]);

  // Auto-activate first provider if none set yet.
  useEffect(() => {
    const providers = providersQuery.data ?? [];
    if (!settings.activeProviderId && providers.length > 0) {
      settingsApi.set({ updates: { activeProviderId: providers[0].id } }).then(setSettings).catch(() => {});
    }
  }, [providersQuery.data, settings.activeProviderId, setSettings]);

  const createChapter = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId) throw new Error("No project selected");
      const n = chapters.length + 1;
      return chapterApi.create({
        projectId: resolvedProjectId,
        title: `第 ${n} 章`,
        filePath: `chapters/chapter-${String(n).padStart(2, "0")}.md`,
        order: n,
      });
    },
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] });
      setChapter(created.id);
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "新建章节失败，请确认当前书籍可用后重试。"));
    },
  });

  const renameChapter = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      chapterApi.update({ id, title }),
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] });
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "重命名章节失败，请稍后重试。"));
    },
  });

  const deleteChapter = useMutation({
    mutationFn: (id: string) => chapterApi.delete({ id }),
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] });
      if (currentChapterId === id) setChapter(null);
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "删除章节失败，请稍后重试。"));
    },
  });

  const reorderChapters = useMutation({
    mutationFn: (orderedIds: string[]) => {
      if (!resolvedProjectId) throw new Error("no project");
      return chapterApi.reorder({ projectId: resolvedProjectId, orderedIds });
    },
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] });
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "调整章节顺序失败，请稍后重试。"));
    },
  });

  const importMd = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId) throw new Error("no project");
      const picked = await fsApi.pickFile({
        title: "选择要导入的 Markdown 文件",
      });
      if (!picked.path || picked.content === null) return null;
      return chapterApi.importMd({
        projectId: resolvedProjectId,
        title: picked.fileName?.replace(/\.(md|markdown|txt)$/i, ""),
        content: picked.content,
      });
    },
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] });
      if (record) setChapter(record.id);
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "导入章节失败，请检查文件后重试。"));
    },
  });

  const switchProject = useMutation({
    mutationFn: async (id: string) => projectApi.open({ id }),
    onMutate: () => {
      setChapterActionError(null);
    },
    onSuccess: async (project) => {
      setProject(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["chapters", project.id] });
    },
    onError: (err) => {
      setChapterActionError(friendlyErrorMessage(err, "打开书籍失败，请稍后重试。"));
    },
  });

  const setMainView = useAppStore((s) => s.setMainView);

  useChapterShortcuts({
    onNewChapter: () => createChapter.mutate(),
  });

  useEffect(() => {
    const handleCreateChapter = () => {
      if (!resolvedProjectId || createChapter.isPending) return;
      createChapter.mutate();
    };
    const handleOpenExport = () => {
      if (currentProjectId) setExportOpen(true);
    };
    window.addEventListener("inkforge:create-chapter", handleCreateChapter);
    window.addEventListener("inkforge:open-export", handleOpenExport);
    return () => {
      window.removeEventListener("inkforge:create-chapter", handleCreateChapter);
      window.removeEventListener("inkforge:open-export", handleOpenExport);
    };
  }, [createChapter, currentProjectId, resolvedProjectId]);

  const resolvedProject = projectsQuery.data?.find((p) => p.id === resolvedProjectId) ?? null;

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-ink-900 text-ink-100">
      {/* B4: 专注模式下标题栏淡出（hover/focus-within 时显示） */}
      <header className={`flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2 xl:px-4 ${focusMode ? "opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-accent-300">墨炉</span>
          <label htmlFor="workspace-project-select" className="sr-only">
            选择书籍
          </label>
          <select
            id="workspace-project-select"
            className="min-w-0 max-w-[15rem] flex-1 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-200 focus:border-accent-500 focus:outline-none"
            value={resolvedProjectId ?? ""}
            onChange={(e) => switchProject.mutate(e.target.value)}
          >
            {(projectsQuery.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {resolvedProject && (
            <span className="hidden whitespace-nowrap text-xs text-ink-400 md:inline">
              目标 {resolvedProject.dailyGoal} 字/日
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ProviderSwitcher providers={providersQuery.data ?? []} />
          {terminalEnabled && (
            <Button
              variant={terminalOpen ? "accentSoft" : "secondary"}
              size="md"
              onClick={() => toggleTerminal()}
              aria-pressed={terminalOpen}
              title="切换终端 (Ctrl+J)"
            >
              终端
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={() => setExportOpen(true)}
            disabled={!currentProjectId}
            title="导入 / 导出"
          >
            导出
          </Button>
          {/* C5: 写作冲刺按钮 */}
          <Button
            variant={pomodoroOpen ? "accentSoft" : "secondary"}
            size="md"
            onClick={() => setPomodoroOpen((v) => !v)}
            aria-pressed={pomodoroOpen}
            title="写作冲刺 · 番茄钟"
          >
            <Timer className="h-4 w-4" />
            冲刺
          </Button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {chapterActionError ? (
          <motion.div
            key="chapter-action-error"
            className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-100"
            role="alert"
            variants={statusMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <span>{chapterActionError}</span>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 border-red-300/20 text-red-100 hover:bg-red-500/20 hover:text-red-100"
              onClick={() => setChapterActionError(null)}
            >
              知道了
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="flex min-h-0 flex-1">
        {!focusMode && (
        <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700 bg-ink-800/40 2xl:w-64">
          <ChapterTree
            chapters={chapters}
            chapterHeadings={chapterHeadings}
            currentChapterId={currentChapterId}
            activeHeadingId={headingJumpTarget?.id ?? null}
            onSelect={(id) => {
              setHeadingJumpTarget(null);
              setChapter(id);
            }}
            // A7: Ctrl+Click 在后台标签页打开
            onOpenInTab={(id) => openInTab(id)}
            onSelectHeading={(chapterId, heading) => {
              headingJumpNonceRef.current += 1;
              setHeadingJumpTarget({ ...heading, chapterId, nonce: headingJumpNonceRef.current });
              setChapter(chapterId);
            }}
            onCreate={() => createChapter.mutate()}
            onRename={(id, title) => renameChapter.mutate({ id, title })}
            onDelete={(id) => deleteChapter.mutate(id)}
            onReorder={(ids) => reorderChapters.mutate(ids)}
            onImportMd={() => importMd.mutate()}
            creating={createChapter.isPending}
            importing={importMd.isPending}
            outlineChapterIds={outlineChapterIds}
            projectId={resolvedProjectId}
            onTrashChanged={() => queryClient.invalidateQueries({ queryKey: ["chapters", resolvedProjectId] })}
          />
        </aside>
        )}

        {/* A7+B4: 编辑器区——多标签栏 + 可选分屏 */}
        <section className={`flex min-w-0 flex-1 flex-col ${focusMode ? "editor-focus-vignette" : ""}`}>
          <EditorTabBar chapters={chapters} focusMode={focusMode} />
          {splitMode ? (
            /* 分屏模式：2-3 列并排 */
            <div className="flex min-h-0 flex-1 divide-x divide-ink-700">
              {splitChapters.map((ch, i) => (
                <div
                  key={ch?.id ?? `empty-${i}`}
                  className="min-w-0 flex-1 overflow-auto"
                  style={i > 0 ? { borderLeft: "1px solid rgb(var(--ink-700))" } : undefined}
                >
                  <EditorPane
                    chapter={ch}
                    headingJumpTarget={i === 0 ? headingJumpTarget : null}
                    providers={providersQuery.data ?? []}
                    onCreateChapter={() => createChapter.mutate()}
                    creatingChapter={createChapter.isPending}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* 单标签模式 */
            <EditorPane
              chapter={currentChapter}
              headingJumpTarget={headingJumpTarget}
              providers={providersQuery.data ?? []}
              onCreateChapter={() => createChapter.mutate()}
              creatingChapter={createChapter.isPending}
            />
          )}
        </section>

        {!focusMode && (
        <aside className="hidden w-72 shrink-0 flex-col border-l border-ink-700 bg-ink-800/40 xl:flex 2xl:w-80">
          <Tabs
            className="shrink-0"
            variant="underline"
            value={rightPanel}
            onChange={(k) => setRightPanel(k as "timeline" | "chat")}
            items={[
              { key: "timeline", label: "写作建议" },
              { key: "chat", label: "聊天助手" },
            ]}
          />
          <div className="min-h-0 flex-1">
            {rightPanel === "timeline" ? <AITimeline /> : <ChatPanel />}
          </div>
        </aside>
        )}
      </main>

      {terminalEnabled && terminalOpen && (
        <TerminalPanel
          height={terminalHeight}
          onClose={() => toggleTerminal(false)}
          onResizeDrag={(delta) => setTerminalHeight(terminalHeight + delta)}
        />
      )}

      {/* C5: Pomodoro 冲刺面板——浮动在右下角 */}
      <AnimatePresence initial={false}>
        {pomodoroOpen && (
          <motion.div
            className="fixed bottom-12 right-6 z-50"
            variants={statusMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <PomodoroTimer onClose={() => setPomodoroOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* B4: 专注模式下隐藏状态栏 */}
      {!focusMode && <StatusBar />}
      <ProviderSettingsPanel />
      {currentProjectId ? (
        <ExportDialog
          projectId={currentProjectId}
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: ["chapters"] })}
        />
      ) : null}
    </div>
  );
}
