import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NovelCharacterRecord, TavernCardRecord } from "@inkforge/shared";
import { novelCharacterApi, tavernCardApi, characterSyncApi } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";

interface NovelCharacterDetailProps {
  novelCharacter: NovelCharacterRecord;
  tavernCards: TavernCardRecord[];
}

function syncModeLabel(mode: TavernCardRecord["syncMode"]): string {
  if (mode === "two-way") return "双向同步";
  if (mode === "snapshot") return "创建时复制";
  return "独立角色";
}

export function NovelCharacterDetail({
  novelCharacter,
  tavernCards,
}: NovelCharacterDetailProps): JSX.Element {
  const queryClient = useQueryClient();
  const setSyncDiffData = useAppStore((s) => s.setSyncDiffData);
  const [localData, setLocalData] = useState(novelCharacter);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalData(novelCharacter);
  }, [novelCharacter]);

  const updateMut = useMutation({
    mutationFn: (updates: Partial<NovelCharacterRecord>) =>
      novelCharacterApi.update({ id: novelCharacter.id, ...updates }),
    onSuccess: async (updated) => {
      queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
      
      // Auto-sync check
      if (updated.linkedTavernCardId) {
        const card = tavernCards.find(c => c.id === updated.linkedTavernCardId);
        if (card && card.syncMode === "two-way") {
          const preview = await characterSyncApi.preview({
            novelCharId: updated.id,
            tavernCardId: card.id,
            direction: "novel_to_card"
          });
          
          const hasConflicts = preview.diffs.some(d => d.conflict);
          if (hasConflicts) {
            setSyncDiffData({
              previewData: preview.diffs,
              novelCharId: updated.id,
              tavernCardId: card.id
            });
          } else if (preview.diffs.length > 0) {
            await characterSyncApi.apply({
              novelCharId: updated.id,
              tavernCardId: card.id,
              direction: "novel_to_card"
            });
            queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
          }
        }
      }
    },
  });

  const handleFieldChange = (field: keyof NovelCharacterRecord, value: any) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateMut.mutate({ [field]: value });
    }, 500);
  };

  const handleUnbind = async () => {
    if (confirm("确定要解绑酒馆卡吗？")) {
      await updateMut.mutateAsync({ linkedTavernCardId: null });
      if (novelCharacter.linkedTavernCardId) {
        await tavernCardApi.update({
          id: novelCharacter.linkedTavernCardId,
          linkedNovelCharacterId: null
        });
        queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
      }
    }
  };

  const linkedCard = tavernCards.find(c => c.id === novelCharacter.linkedTavernCardId);

  return (
    <div className="flex h-full flex-col bg-ink-900/40 p-6 overflow-auto scrollbar-thin">
      <div className="mb-6 flex items-center justify-between">
        <input
          className="bg-transparent text-2xl font-bold text-accent-300 outline-none border-b border-transparent focus:border-accent-500/50 w-full"
          value={localData.name}
          onChange={(e) => handleFieldChange("name", e.target.value)}
          placeholder="角色名称"
        />
        <button 
          onClick={() => {
            if (confirm("确定删除该角色吗？")) {
              novelCharacterApi.delete({ id: novelCharacter.id }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
              });
            }
          }}
          className="text-ink-500 hover:text-red-400 text-xs px-2 py-1"
        >
          删除
        </button>
      </div>

      <div className="space-y-6 flex-1">
        <section>
          <label className="mb-2 block text-xs font-medium text-ink-400">人设</label>
          <textarea
            className="w-full h-32 rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm text-ink-200 focus:border-accent-500/50 focus:outline-none"
            value={localData.persona || ""}
            onChange={(e) => handleFieldChange("persona", e.target.value)}
            placeholder="核心性格、外貌特征等..."
          />
        </section>

        <section>
          <label className="mb-2 block text-xs font-medium text-ink-400">背景</label>
          <textarea
            className="w-full h-40 rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm text-ink-200 focus:border-accent-500/50 focus:outline-none"
            value={localData.backstory || ""}
            onChange={(e) => handleFieldChange("backstory", e.target.value)}
            placeholder="过往经历、成长环境..."
          />
        </section>

        <section>
          <label className="mb-2 block text-xs font-medium text-ink-400">特征</label>
          <div className="rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm text-ink-500 italic">
            结构化特征编辑将在后续版本支持...
          </div>
        </section>
      </div>

      <div className="mt-8 border-t border-ink-700 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink-200">酒馆绑定</h3>
            <p className="text-xs text-ink-500 mt-1">同步此人设到酒馆角色卡</p>
          </div>
          {linkedCard ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-accent-200">{linkedCard.name}</div>
                <div className="text-[10px] text-ink-500">{syncModeLabel(linkedCard.syncMode)}</div>
              </div>
              <button
                onClick={handleUnbind}
                className="rounded border border-ink-700 px-3 py-1 text-xs text-ink-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                解绑
              </button>
            </div>
          ) : (
            <div className="text-xs text-ink-500">未绑定任何酒馆卡</div>
          )}
        </div>
      </div>
    </div>
  );
}
