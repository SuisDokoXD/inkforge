import { useEffect, useMemo } from "react";
import { Users, Plus } from "lucide-react";
import { Button } from "../components/ui";
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
    <div className="page-surface feature-workspace flex h-full w-full flex-col bg-ink-900 overflow-hidden">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-800/55 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Users className="h-5 w-5 text-accent-300" aria-hidden="true" />
          <div className="min-w-0"><h2 className="truncate text-base font-semibold text-ink-100">人物档案</h2><p className="mt-1 text-xs text-ink-500">维护人物卡、关系和出场信息</p></div>
        </div>
        <Button size="sm" variant="accentSoft" onClick={() => window.dispatchEvent(new Event("inkforge:create-character"))}><Plus className="h-3.5 w-3.5" />新建人物</Button>
      </header>
      <div className="flex min-h-0 flex-1">
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

      </div>
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
