import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { novelCharacterApi, tavernCardApi } from "../lib/api";
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

  const novelCharsQuery = useQuery({
    queryKey: ["novelCharacters", currentProjectId],
    queryFn: () => currentProjectId ? novelCharacterApi.list({ projectId: currentProjectId }) : Promise.resolve([]),
    enabled: !!currentProjectId,
  });

  const tavernCardsQuery = useQuery({
    queryKey: ["tavernCards", currentProjectId],
    queryFn: () => tavernCardApi.list({ projectId: currentProjectId || undefined }),
  });

  if (!currentProjectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">未选择项目</div>
          <p className="text-sm text-ink-300">请先在侧边栏选择或创建一个项目以管理人物。</p>
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
          projectId={currentProjectId}
          characters={novelCharsQuery.data || []}
          activeId={activeNovelCharacterId}
          onSelect={setActiveNovelCharacterId}
        />
      </aside>

      {/* Center Column: Detail Editor */}
      <main className="flex-1 min-w-0 flex flex-col">
        {activeChar ? (
          <NovelCharacterDetail 
            novelCharacter={activeChar}
            tavernCards={tavernCardsQuery.data || []}
          />
        ) : (
          <EmptyState
            icon="👤"
            title="选择一个角色开始编辑"
            description="从左侧列表选中角色查看详情，或在右侧导入角色卡为其绑定人格设定。"
          />
        )}
      </main>

      {/* Right Column: Tavern Card List */}
      <aside className="w-[320px] shrink-0">
        <TavernCardList 
          projectId={currentProjectId}
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
