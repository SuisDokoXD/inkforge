import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, UserPlus, UserRound } from "lucide-react";
import type { NovelCharacterRecord, TavernCardCreateInput, TavernCardRecord } from "@inkforge/shared";
import { tavernCardApi, providerApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";
import { Badge } from "../ui";

interface TavernCardListProps {
  projectId: string;
  cards: TavernCardRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
  novelCharacters: NovelCharacterRecord[];
}

function syncModeLabel(mode: TavernCardRecord["syncMode"]): string {
  if (mode === "two-way") return "双向同步";
  if (mode === "snapshot") return "创建时复制";
  return "独立角色";
}

export function TavernCardList({
  projectId,
  cards,
  activeId,
  onSelect,
  novelCharacters,
}: TavernCardListProps): JSX.Element {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
  });

  const createMut = useMutation({
    mutationFn: (input: TavernCardCreateInput) => tavernCardApi.create(input),
    onMutate: () => {
      setCreateError(null);
    },
    onSuccess: (newCard) => {
      void queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
      setMenuOpen(false);
      onSelect(newCard.id);
    },
    onError: (err) => {
      setCreateError(friendlyErrorMessage(err, "酒馆角色创建失败，请稍后重试。"));
    },
  });

  const handleCreateFromNovel = (char: NovelCharacterRecord) => {
    const defaultProvider = providersQuery.data?.[0]?.id || "default";
    createMut.mutate({
      name: char.name,
      persona: char.persona || "",
      providerId: defaultProvider,
      model: "default",
      linkedNovelCharacterId: char.id,
      syncMode: "two-way",
    });
  };

  const unlinkedNovelChars = novelCharacters.filter(c => !c.linkedTavernCardId);

  return (
    <div className="flex h-full flex-col bg-ink-800/40 border-l border-ink-700">
      <div className="flex items-center justify-between border-b border-ink-700 p-3">
        <h2 className="text-sm font-medium text-accent-300">酒馆角色</h2>
        <div className="relative">
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded bg-accent-500/20 px-2 py-1 text-xs text-accent-300 hover:bg-accent-500/30 disabled:opacity-60"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={createMut.isPending}
            aria-expanded={menuOpen}
            aria-controls="tavern-card-create-menu"
            whileHover={reduceMotion || createMut.isPending ? undefined : hoverLift}
            whileTap={reduceMotion || createMut.isPending ? undefined : tapPress}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            从书中创建
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden />
          </motion.button>
          <AnimatePresence initial={false}>
            {menuOpen ? (
              <motion.div
                id="tavern-card-create-menu"
                className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-md border border-ink-700 bg-ink-800 py-1 shadow-xl"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {unlinkedNovelChars.map((char) => (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => handleCreateFromNovel(char)}
                    disabled={createMut.isPending}
                    className="w-full px-3 py-2 text-left text-xs text-ink-300 hover:bg-ink-700 disabled:opacity-60"
                  >
                    {char.name}
                  </button>
                ))}
                {unlinkedNovelChars.length === 0 && (
                  <div className="px-3 py-2 text-xs text-ink-500">没有待绑定的书中人物</div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {createError ? (
          <motion.div
            className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100"
            role="alert"
            variants={stateMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {createError}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {cards.map((card) => {
          return (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className={`flex w-full items-start gap-3 p-3 text-left transition-colors border-b border-ink-700/50 ${
                activeId === card.id ? "bg-ink-700/50" : "hover:bg-ink-700/20"
              }`}
              aria-current={activeId === card.id ? "true" : undefined}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-700 text-lg">
                <UserRound className="h-5 w-5 text-ink-300" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-ink-100">{card.name}</span>
                  <Badge
                    tone="neutral"
                    className="shrink-0 rounded bg-ink-800 px-1.5 font-normal text-ink-400 ring-ink-700/60"
                  >
                    {syncModeLabel(card.syncMode)}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-[11px] text-ink-500">
                  {card.linkedNovelCharacterId ? "已关联书中人物" : "独立讨论角色"}
                </div>
              </div>
            </button>
          );
        })}
        {cards.length === 0 && (
          <div className="p-8 text-center text-xs text-ink-500">暂无酒馆卡</div>
        )}
      </div>
    </div>
  );
}
