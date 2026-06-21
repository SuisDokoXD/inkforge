import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { NovelCharacterRecord, TavernCardRecord } from "@inkforge/shared";
import { novelCharacterApi, tavernCardApi, characterSyncApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { useAppStore } from "../../stores/app-store";
import { fadeOnly } from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import { Badge } from "../ui";

interface NovelCharacterDetailProps {
  novelCharacter: NovelCharacterRecord;
  characters: NovelCharacterRecord[];
  tavernCards: TavernCardRecord[];
}

type EditableNovelCharacterField =
  | "name"
  | "persona"
  | "backstory"
  | "relations"
  | "traits"
  | "linkedTavernCardId";

type CharacterActionStatus = {
  kind: "success" | "error";
  message: string;
};

function syncModeLabel(mode: TavernCardRecord["syncMode"]): string {
  if (mode === "two-way") return "双向同步";
  if (mode === "snapshot") return "创建时复制";
  return "独立角色";
}

export function NovelCharacterDetail({
  novelCharacter,
  characters,
  tavernCards,
}: NovelCharacterDetailProps): JSX.Element {
  const queryClient = useQueryClient();
  const setSyncDiffData = useAppStore((s) => s.setSyncDiffData);
  const [localData, setLocalData] = useState(novelCharacter);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [unbindConfirming, setUnbindConfirming] = useState(false);
  const [unbindPending, setUnbindPending] = useState(false);
  const { status: actionStatus, showStatus: showActionStatus } =
    useTimedStatus<CharacterActionStatus>();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setLocalData(novelCharacter);
    setDeleteConfirming(false);
    setUnbindConfirming(false);
    showActionStatus(null);
  }, [novelCharacter, showActionStatus]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    },
    [],
  );

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
    onError: (err) => {
      showActionStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "角色保存失败，请稍后重试。"),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => novelCharacterApi.delete({ id: novelCharacter.id }),
    onMutate: () => showActionStatus(null),
    onSuccess: () => {
      setDeleteConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
    },
    onError: (err) => {
      showActionStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "角色删除失败，请稍后重试。"),
      });
    },
  });

  const handleFieldChange = <K extends EditableNovelCharacterField>(
    field: K,
    value: NovelCharacterRecord[K],
  ) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      updateMut.mutate({ [field]: value } as Partial<NovelCharacterRecord>);
    }, 500);
  };

  const relationTargets = characters.filter((character) => character.id !== novelCharacter.id);

  const updateRelation = (
    index: number,
    patch: Partial<NovelCharacterRecord["relations"][number]>,
  ) => {
    const next = localData.relations.map((relation, i) =>
      i === index ? { ...relation, ...patch } : relation,
    );
    handleFieldChange("relations", next);
  };

  const addRelation = () => {
    const firstTarget = relationTargets[0];
    if (!firstTarget) return;
    handleFieldChange("relations", [
      ...localData.relations,
      { otherId: firstTarget.id, label: "" },
    ]);
  };

  const removeRelation = (index: number) => {
    handleFieldChange(
      "relations",
      localData.relations.filter((_relation, i) => i !== index),
    );
  };

  const handleUnbind = async () => {
    showActionStatus(null);
    setUnbindPending(true);
    try {
      await updateMut.mutateAsync({ linkedTavernCardId: null });
      if (novelCharacter.linkedTavernCardId) {
        await tavernCardApi.update({
          id: novelCharacter.linkedTavernCardId,
          linkedNovelCharacterId: null
        });
        queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
      }
      showActionStatus({ kind: "success", message: "已解绑酒馆卡。" }, 2200);
      setUnbindConfirming(false);
    } catch (err) {
      showActionStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "解绑酒馆卡失败，请稍后重试。"),
      });
    } finally {
      setUnbindPending(false);
    }
  };

  const linkedCard = tavernCards.find(c => c.id === novelCharacter.linkedTavernCardId);

  return (
    <div className="flex h-full flex-col bg-ink-900/40 p-6 overflow-auto scrollbar-thin">
      <div className="mb-6 flex items-center justify-between">
        <label className="sr-only" htmlFor="novel-character-name">
          角色名称
        </label>
        <input
          id="novel-character-name"
          className="bg-transparent text-2xl font-bold text-accent-300 outline-none border-b border-transparent focus:border-accent-500/50 w-full"
          value={localData.name}
          onChange={(e) => handleFieldChange("name", e.target.value)}
          placeholder="角色名称"
        />
        <AnimatePresence initial={false} mode="wait">
          {deleteConfirming ? (
            <motion.div
              key="delete-confirm"
              variants={fadeOnly}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex shrink-0 items-center gap-1"
            >
              <button
                type="button"
                onClick={() => setDeleteConfirming(false)}
                disabled={deleteMut.isPending}
                className="px-2 py-1 text-xs text-ink-400 hover:text-ink-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleteMut.isPending ? "删除中" : "确认删除"}
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="delete-start"
              type="button"
              onClick={() => setDeleteConfirming(true)}
              className="px-2 py-1 text-xs text-ink-500 hover:text-red-400"
              variants={fadeOnly}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              删除
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {actionStatus ? (
          <motion.div
            key="character-action-status"
            role={actionStatus.kind === "error" ? "alert" : "status"}
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`mb-4 rounded-md border px-3 py-2 text-xs ${
              actionStatus.kind === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {actionStatus.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="space-y-6 flex-1">
        <section>
          <label className="mb-2 block text-xs font-medium text-ink-400" htmlFor="novel-character-persona">
            人设
          </label>
          <textarea
            id="novel-character-persona"
            className="w-full h-32 rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm text-ink-200 focus:border-accent-500/50 focus:outline-none"
            value={localData.persona || ""}
            onChange={(e) => handleFieldChange("persona", e.target.value)}
            placeholder="核心性格、外貌特征等..."
          />
        </section>

        <section>
          <label className="mb-2 block text-xs font-medium text-ink-400" htmlFor="novel-character-backstory">
            背景
          </label>
          <textarea
            id="novel-character-backstory"
            className="w-full h-40 rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm text-ink-200 focus:border-accent-500/50 focus:outline-none"
            value={localData.backstory || ""}
            onChange={(e) => handleFieldChange("backstory", e.target.value)}
            placeholder="过往经历、成长环境..."
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-xs font-medium text-ink-400">人物关系</label>
            <button
              type="button"
              onClick={addRelation}
              disabled={relationTargets.length === 0}
              className="inline-flex items-center gap-1 rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-ink-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              新增关系
            </button>
          </div>
          <div className="rounded-md border border-ink-700 bg-ink-800/40">
            {localData.relations.length === 0 ? (
              <div className="px-3 py-4 text-sm text-ink-500">
                暂无关系。可以手动添加，或从章节识别人物时一起导入关系。
              </div>
            ) : (
              <div className="divide-y divide-ink-700/70">
                {localData.relations.map((relation, index) => {
                  const targetExists = relationTargets.some((target) => target.id === relation.otherId);
                  const relationTargetId = `novel-character-relation-target-${index}`;
                  const relationLabelId = `novel-character-relation-label-${index}`;

                  return (
                    <div key={`${relation.otherId}-${index}`} className="grid gap-2 p-3 md:grid-cols-[1fr_1fr_auto]">
                      <label className="block" htmlFor={relationTargetId}>
                        <span className="mb-1 block text-[10px] text-ink-500">对象</span>
                        <select
                          id={relationTargetId}
                          value={relation.otherId}
                          onChange={(event) =>
                            updateRelation(index, { otherId: event.target.value })
                          }
                          className={`h-8 w-full rounded border bg-ink-900 px-2 text-xs text-ink-100 outline-none focus:border-accent-400 ${
                            targetExists ? "border-ink-700" : "border-amber-500/50"
                          }`}
                        >
                          {!targetExists ? (
                            <option value={relation.otherId}>已删除的人物</option>
                          ) : null}
                          {relationTargets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block" htmlFor={relationLabelId}>
                        <span className="mb-1 block text-[10px] text-ink-500">关系</span>
                        <input
                          id={relationLabelId}
                          value={relation.label}
                          onChange={(event) =>
                            updateRelation(index, { label: event.target.value })
                          }
                          placeholder="例如：同伴、敌对、师徒"
                          className="h-8 w-full rounded border border-ink-700 bg-ink-900 px-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-accent-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeRelation(index)}
                        aria-label="删除关系"
                        className="mt-auto flex h-8 w-8 items-center justify-center rounded border border-ink-700 text-ink-400 hover:border-red-500/50 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
                <Badge
                  tone="neutral"
                  className="ml-auto mt-1 flex w-fit rounded bg-ink-800/60 px-1.5 py-0 font-normal text-ink-500 ring-ink-700/60"
                >
                  {syncModeLabel(linkedCard.syncMode)}
                </Badge>
              </div>
              <AnimatePresence initial={false} mode="wait">
                {unbindConfirming ? (
                  <motion.div
                    key="unbind-confirm"
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => setUnbindConfirming(false)}
                      disabled={unbindPending}
                      className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-400 hover:bg-ink-800"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUnbind()}
                      disabled={unbindPending}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {unbindPending ? "解绑中" : "确认解绑"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="unbind-start"
                    type="button"
                    onClick={() => setUnbindConfirming(true)}
                    className="rounded border border-ink-700 px-3 py-1 text-xs text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    解绑
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-xs text-ink-500">未绑定任何酒馆卡</div>
          )}
        </div>
      </div>
    </div>
  );
}
