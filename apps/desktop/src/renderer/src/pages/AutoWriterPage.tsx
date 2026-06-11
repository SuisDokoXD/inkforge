import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, FileText, PenLine } from "lucide-react";
import type { ChapterRecord, ProjectRecord } from "@inkforge/shared";
import { chapterApi, projectApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { AutoWriterPanel } from "../components/auto-writer/AutoWriterPanel";

export function AutoWriterPage(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const setCurrentProject = useAppStore((s) => s.setProject);
  const setCurrentChapter = useAppStore((s) => s.setChapter);
  const setMainView = useAppStore((s) => s.setMainView);
  const flowActions = useWritingFlowActions();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
  });
  const projects: ProjectRecord[] = projectsQuery.data ?? [];

  useEffect(() => {
    if (!currentProjectId && projects.length > 0) {
      setCurrentProject(projects[0].id);
    }
  }, [currentProjectId, projects, setCurrentProject]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const chaptersQuery = useQuery({
    queryKey: ["chapters", currentProjectId],
    queryFn: () =>
      currentProjectId
        ? chapterApi.list({ projectId: currentProjectId })
        : Promise.resolve([] as ChapterRecord[]),
    enabled: !!currentProjectId,
  });
  const chapters = chaptersQuery.data ?? [];

  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  useEffect(() => {
    if (chapters.length === 0) {
      if (activeChapterId) setActiveChapterId(null);
      return;
    }

    const currentChapter = currentChapterId
      ? chapters.find((chapter) => chapter.id === currentChapterId)
      : null;
    if (currentChapter) {
      if (activeChapterId !== currentChapter.id) setActiveChapterId(currentChapter.id);
      return;
    }

    if (!activeChapterId || !chapters.some((chapter) => chapter.id === activeChapterId)) {
      const fallback = chapters[chapters.length - 1];
      setActiveChapterId(fallback.id);
      setCurrentChapter(fallback.id);
    }
  }, [activeChapterId, chapters, currentChapterId, setCurrentChapter]);

  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)_300px] bg-ink-950 text-ink-100">
      <aside className="flex min-h-0 flex-col border-r border-ink-700 bg-ink-900/55">
        <header className="border-b border-ink-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-accent-300" />
            <h2 className="text-sm font-semibold">自动写作</h2>
          </div>
        </header>

        <section className="border-b border-ink-700 p-4">
          <label className="mb-1 block text-xs font-medium text-ink-400">当前书籍</label>
          <select
            value={currentProjectId ?? ""}
            onChange={(event) => {
              setCurrentProject(event.target.value || null);
              setActiveChapterId(null);
            }}
            className="h-9 w-full rounded-md border border-ink-700 bg-ink-950 px-2 text-sm text-ink-100"
          >
            <option value="">选择书籍</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-10 border-b border-ink-700 bg-ink-900 px-4 py-2 text-xs font-medium text-ink-300">
            章节
          </div>
          {chapters.length === 0 ? (
            <div className="space-y-3 px-4 py-8 text-sm text-ink-500">
              <p>这本书还没有章节。可以先去大纲生成章节，或回到正文页新建一章。</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-xs text-ink-300 hover:bg-ink-800"
                  onClick={() => flowActions.openOutline()}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  去大纲
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-xs text-ink-300 hover:bg-ink-800"
                  onClick={() => setMainView("writing")}
                >
                  <FileText className="h-3.5 w-3.5" />
                  去正文
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-ink-700/70">
              {chapters.map((chapter) => {
                const active = activeChapterId === chapter.id;
                return (
                  <li key={chapter.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChapterId(chapter.id);
                        setCurrentChapter(chapter.id);
                      }}
                      className={`w-full px-4 py-3 text-left transition ${
                        active ? "bg-accent-500/12" : "hover:bg-ink-800/70"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {chapter.title || "未命名章节"}
                        </span>
                        <span className="text-[11px] text-ink-500">#{chapter.order}</span>
                      </div>
                      <div className="text-xs text-ink-500">{chapter.wordCount} 字</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <main className="min-h-0 min-w-0">
        {!activeProject || !activeChapter ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div className="max-w-md">
              <FileText className="mx-auto mb-4 h-10 w-10 text-ink-600" />
              <div className="mb-2 text-base font-semibold text-ink-200">
                选择一个章节
              </div>
              <p className="text-sm leading-6 text-ink-500">
                自动写作会在选中章节中续写。先选择书籍和章节，再写下本章方向、叙事重点和需要避免的偏差。
              </p>
            </div>
          </div>
        ) : (
          <AutoWriterPanel
            key={activeChapter.id}
            variant="embedded"
            chapterId={activeChapter.id}
            projectId={activeProject.id}
            chapterTitle={activeChapter.title}
            onClose={() => setActiveChapterId(null)}
          />
        )}
      </main>

      <aside className="hidden min-h-0 border-l border-ink-700 bg-ink-900/35 p-4 xl:block">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-200">
          <BookOpen className="h-4 w-4 text-ink-400" />
          使用流程
        </div>
        <ol className="space-y-3 text-sm leading-6 text-ink-400">
          <li>
            <span className="text-ink-200">1. 选章节</span>
            <br />
            自动写作会写入左侧选中的章节。
          </li>
          <li>
            <span className="text-ink-200">2. 写简报</span>
            <br />
            说明场景、人物状态、情绪走向和本章要推进的内容。
          </li>
          <li>
            <span className="text-ink-200">3. 设长度</span>
            <br />
            段落长度决定节奏；段数决定本次写作规模。
          </li>
          <li>
            <span className="text-ink-200">4. 运行后校对</span>
            <br />
            运行结束后逐段查看，不满意的段落再重写。
          </li>
        </ol>
      </aside>
    </div>
  );
}
