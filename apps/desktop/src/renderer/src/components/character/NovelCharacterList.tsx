import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { NovelCharacterRecord } from "@inkforge/shared";
import { novelCharacterApi } from "../../lib/api";
import { staggerContainer, staggerItem, fadeOnly } from "../../lib/motion-tokens";

interface NovelCharacterListProps {
  projectId: string;
  characters: NovelCharacterRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function NovelCharacterList({
  projectId,
  characters,
  activeId,
  onSelect,
}: NovelCharacterListProps): JSX.Element {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

  const createMut = useMutation({
    mutationFn: () =>
      novelCharacterApi.create({
        projectId,
        name: "新角色",
        backstory: "",
        persona: "",
        traits: {},
      }),
    onSuccess: (newChar) => {
      queryClient.invalidateQueries({ queryKey: ["novelCharacters", projectId] });
      onSelect(newChar.id);
    },
  });

  return (
    <div className="flex h-full flex-col bg-ink-800/40">
      <div className="flex items-center justify-between border-b border-ink-700 p-3">
        <h2 className="text-sm font-medium text-accent-300">书中角色</h2>
        <button
          onClick={() => createMut.mutate()}
          className="rounded bg-accent-500/20 px-2 py-1 text-xs text-accent-300 hover:bg-accent-500/30"
          disabled={createMut.isPending}
        >
          + 新建
        </button>
      </div>
      <motion.div
        className="flex-1 overflow-auto scrollbar-thin"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {characters.map((char) => (
          <motion.button
            key={char.id}
            variants={reduce ? fadeOnly : staggerItem}
            onClick={() => onSelect(char.id)}
            className={`flex w-full flex-col p-3 text-left transition-colors border-b border-ink-700/50 ${
              activeId === char.id ? "bg-ink-700/50" : "hover:bg-ink-700/20"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-ink-100">{char.name}</span>
              {char.linkedTavernCardId ? (
                <span className="shrink-0 rounded bg-green-500/20 px-1 text-[10px] text-green-400">
                  已绑定
                </span>
              ) : (
                <span className="shrink-0 rounded bg-ink-700 px-1 text-[10px] text-ink-400">
                  未绑定
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-ink-400">
              {char.backstory || "暂无背景..."}
            </div>
          </motion.button>
        ))}
        {characters.length === 0 && (
          <div className="p-8 text-center text-xs text-ink-500">暂无书中人物</div>
        )}
      </motion.div>
    </div>
  );
}
