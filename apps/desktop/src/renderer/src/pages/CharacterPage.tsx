import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { novelCharacterApi, projectApi, tavernCardApi } from "../lib/api";
import { NovelCharacterList } from "../components/character/NovelCharacterList";
import { NovelCharacterDetail } from "../components/character/NovelCharacterDetail";
import { TavernCardList } from "../components/character/TavernCardList";
import { SyncDiffDialog } from "../components/character/SyncDiffDialog";
import { EmptyState } from "../components/EmptyState";

export function CharacterPage(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const activeNovelCharacterId = useAppStore((s) => s.activeNovelCharacterId);
  const setActiveNovelCharacterId = useAppStore((s) => s.setActiveNovelCharacterId);
  const activeTavernCardId = useAppStore((s) => s.activeTavernCardId);
  const setActiveTavernCardId = useAppStore((s) => s.setActiveTavernCardId);
  const syncDiffData = useAppStore((s) => s.syncDiffData);
  const setSyncDiffData = useAppStore((s) => s.setSyncDiffData);
  const setProject = useAppStore((s) => s.setProject);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
  });

  const projects = projectsQuery.data || [];
  const activeProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );
  const resolvedProjectId = activeProject?.id ?? null;

  useEffect(() => {
    if (projects.length === 0) return;
    if (!currentProjectId || !projects.some((project) => project.id === currentProjectId)) {
      setProject(projects[0].id);
      setActiveNovelCharacterId(null);
      setActiveTavernCardId(null);
    }
  }, [
    currentProjectId,
    projects,
    setActiveNovelCharacterId,
    setActiveTavernCardId,
    setProject,
  ]);

  const handleProjectChange = (projectId: string) => {
    setProject(projectId || null);
    setActiveNovelCharacterId(null);
    setActiveTavernCardId(null);
  };

  const novelCharsQuery = useQuery({
    queryKey: ["novelCharacters", resolvedProjectId],
    queryFn: () =>
      resolvedProjectId
        ? novelCharacterApi.list({ projectId: resolvedProjectId })
        : Promise.resolve([]),
    enabled: !!resolvedProjectId,
  });

  const tavernCardsQuery = useQuery({
    queryKey: ["tavernCards", resolvedProjectId],
    queryFn: () => tavernCardApi.list({ projectId: resolvedProjectId || undefined }),
  });

  if (!resolvedProjectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">还没有选中书籍</div>
          <p className="text-sm text-ink-300">
            请先去书房打开一本书，人物和章节识别都会按当前书籍保存。
          </p>
        </div>
      </div>
    );
  }

  const activeChar = (novelCharsQuery.data || []).find(c => c.id === activeNovelCharacterId);

  return (
    <div className="flex h-full w-full bg-ink-900 overflow-hidden">
      {/* Left Column: Novel Character List */}
      <aside className="w-[300px] shrink-0 border-r border-ink-700">
        <NovelCharacterList 
          projectId={resolvedProjectId}
          projects={projects}
          activeProjectId={resolvedProjectId}
          characters={novelCharsQuery.data || []}
          activeId={activeNovelCharacterId}
          onProjectChange={handleProjectChange}
          onSelect={setActiveNovelCharacterId}
        />
      </aside>

      {/* Center Column: Detail Editor */}
      <main className="flex-1 min-w-0 flex flex-col">
        {activeChar ? (
          <NovelCharacterDetail 
            novelCharacter={activeChar}
            characters={novelCharsQuery.data || []}
            tavernCards={tavernCardsQuery.data || []}
          />
        ) : (
          <EmptyState
            icon="👤"
            title="选择一个角色开始编辑"
            description="从左侧列表选中角色查看详情，也可以先从章节里识别人物。"
          />
        )}
      </main>

      {/* Right Column: Tavern Card List */}
      <aside className="w-[320px] shrink-0">
        <TavernCardList 
          projectId={resolvedProjectId}
          cards={tavernCardsQuery.data || []}
          activeId={activeTavernCardId}
          onSelect={setActiveTavernCardId}
          novelCharacters={novelCharsQuery.data || []}
        />
      </aside>

      {/* Conflict Dialog */}
      {syncDiffData && (
        <SyncDiffDialog 
          open={true}
          previewData={syncDiffData.previewData}
          novelCharId={syncDiffData.novelCharId}
          tavernCardId={syncDiffData.tavernCardId}
          onClose={() => setSyncDiffData(null)}
          onApplied={() => setSyncDiffData(null)}
        />
      )}
    </div>
  );
}
