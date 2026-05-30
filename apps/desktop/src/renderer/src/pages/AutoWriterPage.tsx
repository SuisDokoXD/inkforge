import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChapterRecord, ProjectRecord } from "@inkforge/shared";
import { chapterApi, projectApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { AutoWriterPanel } from "../components/auto-writer/AutoWriterPanel";

/**
 * v20: AutoWriter 独立顶级页面。
 *
 * 三栏：
 *  - 左：选书 → 选章节（含「写完跳下一章」与「在新章续写」入口）
 *  - 中：复用 AutoWriterPanel（嵌入式渲染，去掉 fixed 浮层时由我们包一层 wrapper）
 *  - 右：当前书的全局世界观 / 文风样本数 / 历史 run（占位提示，详情在 ChapterListItem 的 AutoWriter 浮层中显示）
 *
 * 设计理由：原 AutoWriterPanel 是 `fixed inset-y-0 right-0`，在顶级页里也工作良好；
 * 我们让它「叠在」中栏，左 / 右栏作为辅助导航。
 */
export function AutoWriterPage(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentProject = useAppStore((s) => s.setProject);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
  });
  const projects: ProjectRecord[] = projectsQuery.data ?? [];

  // 默认锁定到当前 project；若无则取第一本
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
    if (!activeChapterId && chapters.length > 0) {
      setActiveChapterId(chapters[chapters.length - 1].id);
    }
  }, [activeChapterId, chapters]);

  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* ===== 左栏：书 + 章节导航 ===== */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/40">
        <div className="border-b border-ink-700 px-3 py-2 text-xs font-semibold text-ink-200">
          🤖 AI 全自动写作
        </div>
        <div className="border-b border-ink-700 p-3">
          <label className="mb-1 block text-[11px] text-ink-400">当前书籍</label>
          <select
            value={currentProjectId ?? ""}
            onChange={(e) => {
              setCurrentProject(e.target.value || null);
              setActiveChapterId(null);
            }}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
          >
            <option value="">— 请选择书籍 —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {chapters.length === 0 ? (
            <div className="p-3 text-[11px] text-ink-500">
              该书还没有章节。先去「书房」创建一个。
            </div>
          ) : (
            <ul>
              {chapters.map((ch) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => setActiveChapterId(ch.id)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-ink-700/50 px-3 py-2 text-left text-xs transition-colors ${
                      activeChapterId === ch.id
                        ? "bg-accent-500/10 text-accent-100"
                        : "text-ink-200 hover:bg-ink-800/40"
                    }`}
                  >
                    <span className="truncate font-medium">
                      {ch.order}. {ch.title || "（未命名）"}
                    </span>
                    <span className="text-[10px] text-ink-500">
                      {ch.wordCount} 字
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ===== 中栏：思路输入 / 模型 / 控制 ===== */}
      <main className="flex min-h-0 flex-1 flex-col bg-ink-900/20">
        {!activeProject || !activeChapter ? (
          <div className="m-auto max-w-md text-center text-sm text-ink-400">
            <div className="mb-2 text-3xl">🤖</div>
            <div>选择一本书 + 一个章节后，启动 AutoWriter。</div>
            <div className="mt-2 text-[11px] text-ink-500">
              本页跨章节读取上下文 / 注入全局世界观 / 学习素材库文风。
              <br />
              想从头写一章：先在「书房」新建空章节再回来这里。
            </div>
          </div>
        ) : (
          <AutoWriterPanel
            key={activeChapter.id}
            chapterId={activeChapter.id}
            projectId={activeProject.id}
            chapterTitle={activeChapter.title}
            onClose={() => setActiveChapterId(null)}
          />
        )}
      </main>
    </div>
  );
}
