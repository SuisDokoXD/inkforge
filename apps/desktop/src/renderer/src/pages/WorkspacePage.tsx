import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChapterRecord } from "@inkforge/shared";
import { chapterApi, fsApi, llmApi, projectApi, providerApi, settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useChapterShortcuts } from "../lib/use-app-shortcuts";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { EditorPane } from "../components/EditorPane";
import { ChapterTree } from "../components/ChapterTree";
import { AITimeline } from "../components/AITimeline";
import { ChatPanel } from "../components/ChatPanel";
import { TerminalPanel } from "../components/TerminalPanel";
import { StatusBar } from "../components/StatusBar";
import { ProviderSwitcher } from "../components/ProviderSwitcher";
import { ProviderSettingsPanel } from "../components/ProviderSettingsPanel";
import { ExportDialog } from "../components/ExportDialog";
import { Button, Tabs } from "../components/ui";
import { cn } from "../lib/cn";

interface ChapterHeadingItem {
  id: string;
  title: string;
  line: number;
}

interface HeadingJumpTarget extends ChapterHeadingItem {
  chapterId: string;
  nonce: number;
}

function extractChapterHeadings(chapterId: string, content: string): ChapterHeadingItem[] {
  const headings: ChapterHeadingItem[] = [];
  const lines = content.split(/\r?\n/);
  const headingPattern = /^\s{0,3}#{2,4}\s+(.+?)\s*#*\s*$/;
  lines.forEach((line, index) => {
    const match = line.match(headingPattern);
    if (!match) return;
    const title = match[1].trim();
    if (!title) return;
    const previous = headings[headings.length - 1];
    if (previous?.title === title) {
      const between = lines.slice(previous.line, index);
      const hasBodyBetween = between.some((item) => item.trim() && !headingPattern.test(item));
      if (!hasBodyBetween) return;
    }
    headings.push({
      id: `${chapterId}:${index}`,
      title,
      line: index + 1,
    });
  });
  return headings.slice(0, 24);
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

  const [exportOpen, setExportOpen] = useState(false);
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

  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const headingQueries = useQueries({
    queries: chapters.map((chapter) => ({
      queryKey: ["chapter-heading-outline", chapter.id, chapter.updatedAt, chapter.wordCount],
      queryFn: async () => {
        const res = await chapterApi.read({ id: chapter.id });
        return extractChapterHeadings(chapter.id, res.content);
      },
      enabled: !!resolvedProjectId,
      staleTime: 30_000,
    })),
  });
  const chapterHeadings = useMemo(() => {
    const map: Record<string, ChapterHeadingItem[]> = {};
    chapters.forEach((chapter, index) => {
      map[chapter.id] = headingQueries[index]?.data ?? [];
    });
    return map;
  }, [chapters, headingQueries]);
  const currentChapter = useMemo(
    () => chapters.find((c) => c.id === currentChapterId) ?? null,
    [chapters, currentChapterId],
  );

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

  const resolvedProject = projectsQuery.data?.find((p) => p.id === resolvedProjectId) ?? null;

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-ink-900 text-ink-100">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2 xl:px-4">
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
          <Button
            variant="secondary"
            size="md"
            onClick={() => openSettings(true)}
            title="设置 (Ctrl+,)"
          >
            设置
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
          />
        </aside>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          <EditorPane
            chapter={currentChapter}
            headingJumpTarget={headingJumpTarget}
            providers={providersQuery.data ?? []}
            onCreateChapter={() => createChapter.mutate()}
            creatingChapter={createChapter.isPending}
          />
        </section>

        {!focusMode && (
        <aside className={cn(
          "hidden w-72 shrink-0 flex-col border-l border-ink-700 bg-ink-800/40 xl:flex 2xl:w-80",
          settings.glassEnabled && "glass-panel border-l-0",
        )}>
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

      <StatusBar />
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
