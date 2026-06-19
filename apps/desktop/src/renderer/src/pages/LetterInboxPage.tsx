import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, useReducedMotion } from "motion/react";
import {
  Archive,
  BookOpenText,
  Inbox,
  MailPlus,
  Pin,
  PinOff,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  CharacterLetterRecord,
  CharacterLetterTone,
} from "@inkforge/shared";
import { AnimatedDialog } from "../components/AnimatedDialog";
import { MotionSpinner } from "../components/MotionSpinner";
import { letterApi, novelCharacterApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";

type LetterFilter = "all" | "unread" | "pinned";

const TONE_LABEL: Record<CharacterLetterTone, { label: string; color: string }> = {
  grateful: {
    label: "感谢",
    color: "bg-rose-500/15 text-rose-700 ring-rose-400/35 dark:text-rose-200",
  },
  complaint: {
    label: "抱怨",
    color: "bg-amber-500/15 text-amber-800 ring-amber-400/35 dark:text-amber-200",
  },
  curious: {
    label: "追问",
    color: "bg-sky-500/15 text-sky-700 ring-sky-400/35 dark:text-sky-200",
  },
  encouraging: {
    label: "鼓励",
    color: "bg-emerald-500/15 text-emerald-700 ring-emerald-400/35 dark:text-emerald-200",
  },
  neutral: {
    label: "日常",
    color: "bg-ink-700/10 text-ink-700 ring-ink-500/35 dark:bg-ink-700/45 dark:text-ink-200 dark:ring-ink-600",
  },
};

const FILTERS: Array<{ value: LetterFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "pinned", label: "置顶" },
];

const QUICK_TONES: Array<{
  tone: CharacterLetterTone;
  title: string;
  description: string;
}> = [
  {
    tone: "encouraging",
    title: "给作者一点回应",
    description: "让角色说说自己认可什么，适合卡文时找回情绪。",
  },
  {
    tone: "complaint",
    title: "听听角色的不满",
    description: "让人物指出剧情安排里不顺、不像自己的地方。",
  },
  {
    tone: "curious",
    title: "追问命运走向",
    description: "让角色主动追问后续选择，帮助发现悬念。",
  },
  {
    tone: "neutral",
    title: "写一封日常来信",
    description: "用更轻的语气整理人物近况和关系温度。",
  },
];

export function LetterInboxPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const setMainView = useAppStore((s) => s.setMainView);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LetterFilter>("all");
  const [showGen, setShowGen] = useState(false);
  const [presetTone, setPresetTone] = useState<CharacterLetterTone | undefined>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [letterActionError, setLetterActionError] = useState<string | null>(null);

  const lettersQuery = useQuery({
    queryKey: ["letters", projectId],
    queryFn: () => letterApi.list({ projectId: projectId ?? "" }),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  const charactersQuery = useQuery({
    queryKey: ["characters", projectId],
    queryFn: () => novelCharacterApi.list({ projectId: projectId ?? "" }),
    enabled: !!projectId,
  });

  const markReadMut = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      letterApi.markRead({ letterId: id, read }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["letters", projectId] }),
  });

  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      letterApi.pin({ letterId: id, pinned }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["letters", projectId] }),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => letterApi.dismiss({ letterId: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["letters", projectId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => letterApi.delete({ letterId: id }),
    onMutate: (id) => {
      setDeletingId(id);
      setLetterActionError(null);
    },
    onSuccess: async (_result, id) => {
      setSelectedId((current) => (current === id ? null : current));
      setDeleteConfirmId(null);
      await queryClient.invalidateQueries({ queryKey: ["letters", projectId] });
    },
    onError: (err) => {
      setLetterActionError(friendlyErrorMessage(err, "删除来信失败，请稍后重试。"));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const quickGenerateMut = useMutation({
    mutationFn: (tone: CharacterLetterTone) => {
      if (!projectId) throw new Error("no_project");
      return letterApi.generate({ projectId, tone });
    },
    onSuccess: async (letter) => {
      await queryClient.invalidateQueries({ queryKey: ["letters", projectId] });
      setSelectedId(letter.id);
      setFilter("all");
    },
  });

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950/30 text-sm text-ink-400">
        请先在写作页或书架中选择一本书。
      </div>
    );
  }

  const letters = lettersQuery.data ?? [];
  const characters = charactersQuery.data ?? [];
  const characterMap = new Map(characters.map((c) => [c.id, c]));
  const unreadCount = letters.filter((l) => !l.read).length;
  const pinnedCount = letters.filter((l) => l.pinned).length;

  const visibleLetters = useMemo(() => {
    if (filter === "unread") return letters.filter((l) => !l.read);
    if (filter === "pinned") return letters.filter((l) => l.pinned);
    return letters;
  }, [filter, letters]);

  const selected = letters.find((l) => l.id === selectedId) ?? null;

  const openGenerate = (tone?: CharacterLetterTone) => {
    setPresetTone(tone);
    setShowGen(true);
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-ink-950/20">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-ink-700 bg-ink-900/55">
        <div className="border-b border-ink-700 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
                <Inbox className="h-4 w-4 text-accent-300" />
                角色来信
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-400">
                让人物以自己的口吻写给作者，用来捕捉动机、关系和未说出口的情绪。
              </p>
            </div>
            <button
              type="button"
              onClick={() => openGenerate()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400"
            >
              <MailPlus className="h-3.5 w-3.5" />
              新来信
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <Metric label="信件" value={letters.length} />
            <Metric label="未读" value={unreadCount} />
            <Metric label="置顶" value={pinnedCount} />
          </div>

          <div className="mt-3 flex rounded-md border border-ink-700 bg-ink-950/40 p-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`min-w-0 flex-1 rounded px-2 py-1 text-xs transition-colors ${
                  filter === item.value
                    ? "bg-accent-500/18 text-accent-200"
                    : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <VirtualLetterList
          letters={visibleLetters}
          selectedId={selectedId}
          characterMap={characterMap}
          emptyText={
            letters.length === 0
              ? "还没有来信。可以从右侧选择一种来信方式开始。"
              : "当前筛选下没有信件。"
          }
          onSelect={(id, l) => {
            setSelectedId(id);
            setDeleteConfirmId(null);
            setLetterActionError(null);
            if (!l.read) markReadMut.mutate({ id, read: true });
          }}
          onPin={(l) => pinMut.mutate({ id: l.id, pinned: !l.pinned })}
          onDismiss={(l) => dismissMut.mutate(l.id)}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-ink-900 via-ink-900/70 to-ink-950">
        {selected ? (
          <LetterDetail
            letter={selected}
            characterName={characterMap.get(selected.characterId)?.name ?? "未知人物"}
            deleteConfirming={deleteConfirmId === selected.id}
            deleting={deletingId === selected.id}
            deleteError={letterActionError}
            onRequestDelete={() => {
              setLetterActionError(null);
              if (deleteConfirmId === selected.id) {
                deleteMut.mutate(selected.id);
                return;
              }
              setDeleteConfirmId(selected.id);
            }}
            onCancelDelete={() => {
              setDeleteConfirmId(null);
              setLetterActionError(null);
            }}
          />
        ) : (
          <LetterGuide
            hasCharacters={characters.length > 0}
            generating={quickGenerateMut.isPending}
            onGenerate={openGenerate}
            onQuickGenerate={(tone) => quickGenerateMut.mutate(tone)}
            onOpenCharacters={() => setMainView("character")}
          />
        )}
      </main>

      <GenerateLetterDialog
        open={showGen}
        projectId={projectId}
        characters={characters}
        initialTone={presetTone}
        onOpenCharacters={() => {
          setShowGen(false);
          setMainView("character");
        }}
        onClose={() => setShowGen(false)}
        onGenerated={(letter) => {
          queryClient.invalidateQueries({ queryKey: ["letters", projectId] });
          setSelectedId(letter.id);
          setFilter("all");
          setShowGen(false);
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-700/80 bg-ink-950/30 px-2 py-2">
      <div className="text-sm font-semibold text-ink-100">{value}</div>
      <div className="mt-0.5 text-ink-500">{label}</div>
    </div>
  );
}

function LetterGuide({
  hasCharacters,
  generating,
  onGenerate,
  onQuickGenerate,
  onOpenCharacters,
}: {
  hasCharacters: boolean;
  generating: boolean;
  onGenerate: (tone?: CharacterLetterTone) => void;
  onQuickGenerate: (tone: CharacterLetterTone) => void;
  onOpenCharacters: () => void;
}): JSX.Element {
  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <section className="rounded-lg border border-ink-700 bg-ink-900/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-accent-200">
                <BookOpenText className="h-4 w-4" />
                来信不是任务，是另一种人物访谈
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-ink-50">
                让角色先开口，作者再判断要不要听。
              </h1>
              <p className="mt-3 text-sm leading-7 text-ink-300">
                当剧情推进不顺、人物声音变弱，或关系线不够清楚时，让角色写一封信。
                它会把“我为什么这样做”“我不愿说什么”“我希望作者别忘什么”整理出来。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGenerate()}
              disabled={!hasCharacters}
              className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:bg-ink-200 disabled:text-ink-500 disabled:opacity-100 dark:disabled:bg-ink-800 dark:disabled:text-ink-500"
            >
              <MailPlus className="h-4 w-4" />
              生成一封来信
            </button>
          </div>
          {!hasCharacters && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/45 bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              <span>当前项目还没有人物档案。先创建人物，来信才会有明确口吻。</span>
              <button
                type="button"
                onClick={onOpenCharacters}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/45 bg-white/35 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/60 dark:border-amber-300/30 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10"
              >
                <UserRound className="h-3.5 w-3.5" />
                去人物页
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-100">常用来信方式</h2>
            {generating && (
              <span
                className="inline-flex items-center gap-1 text-xs text-ink-400"
                role="status"
              >
                <MotionSpinner />
                生成中
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {QUICK_TONES.map((item) => (
              <button
                key={item.tone}
                type="button"
                onClick={() =>
                  hasCharacters ? onQuickGenerate(item.tone) : onGenerate(item.tone)
                }
                disabled={generating}
                className="rounded-lg border border-ink-700 bg-ink-900/45 p-4 text-left transition-colors hover:border-accent-400/40 hover:bg-ink-800/60 disabled:opacity-60"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                    TONE_LABEL[item.tone].color
                  }`}
                >
                  {TONE_LABEL[item.tone].label}
                </span>
                <div className="mt-3 text-sm font-medium text-ink-100">
                  {item.title}
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-400">
                  {item.description}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ["检查口吻", "读信时看角色是否说出了只有他会说的话。"],
            ["寻找冲突", "抱怨和追问常常能暴露人物与剧情的错位。"],
            ["保留火花", "置顶有价值的信，后续写关系线时再回来读。"],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="rounded-lg border border-ink-700/80 bg-ink-900/35 p-4"
            >
              <div className="text-sm font-medium text-ink-100">{title}</div>
              <p className="mt-2 text-xs leading-5 text-ink-400">{desc}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function LetterRow({
  letter,
  characterName,
  active,
  onClick,
  onPin,
  onDismiss,
}: {
  letter: CharacterLetterRecord;
  characterName: string;
  active: boolean;
  onClick: () => void;
  onPin: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const tone = TONE_LABEL[letter.tone];
  return (
    <div
      className={`group mb-1.5 flex flex-col rounded-md border px-3 py-2.5 transition-colors ${
        active
          ? "border-accent-400/40 bg-accent-500/10"
          : "border-transparent hover:bg-ink-800/70"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`打开来信：${letter.subject}`}
        className="min-w-0 text-left"
      >
        <div className="flex items-center gap-1.5">
          {!letter.read && (
            <span
              aria-label="未读"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400"
            />
          )}
          {letter.pinned && <Pin className="h-3 w-3 shrink-0 text-accent-300" />}
          <span className="truncate text-[12px] font-medium text-ink-100">
            {letter.subject}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-ink-400">
          <span className="truncate">{characterName}</span>
          <span className="shrink-0">
            {new Date(letter.generatedAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${tone.color}`}
        >
          {tone.label}
        </span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            title={letter.pinned ? "取消置顶" : "置顶"}
            className="rounded p-1 text-ink-500 hover:bg-ink-700 hover:text-accent-300"
          >
            {letter.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            title="归档"
            className="rounded p-1 text-ink-500 hover:bg-ink-700 hover:text-rose-300"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LetterDetail({
  letter,
  characterName,
  deleteConfirming,
  deleting,
  deleteError,
  onRequestDelete,
  onCancelDelete,
}: {
  letter: CharacterLetterRecord;
  characterName: string;
  deleteConfirming: boolean;
  deleting: boolean;
  deleteError: string | null;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
}): JSX.Element {
  const tone = TONE_LABEL[letter.tone];
  return (
    <div className="flex h-full flex-col overflow-y-auto p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${tone.color}`}>
            {tone.label}
          </span>
          <span className="text-xs text-ink-500">
            {new Date(letter.generatedAt).toLocaleString("zh-CN")}
          </span>
          {deleteConfirming && !deleting && (
            <button
              type="button"
              data-testid="letter-delete-cancel"
              onClick={onCancelDelete}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            >
              取消
            </button>
          )}
          <button
            type="button"
            data-testid="letter-delete-button"
            onClick={onRequestDelete}
            disabled={deleting}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              deleteConfirming
                ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                : "text-ink-500 hover:bg-ink-800 hover:text-rose-300"
            } disabled:cursor-wait disabled:opacity-70 ${deleteConfirming ? "" : "ml-auto"}`}
          >
            {deleting ? (
              <MotionSpinner />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {deleting ? "删除中" : deleteConfirming ? "确认删除" : "删除"}
          </button>
        </div>
        {deleteError && (
          <div className="mb-4 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {deleteError}
          </div>
        )}
        <h1 className="text-2xl font-semibold text-ink-50">{letter.subject}</h1>
        <div className="mt-2 text-sm text-ink-400">来自：{characterName}</div>

        <article className="mt-7 rounded-lg border border-accent-100/10 bg-gradient-to-br from-accent-50/[0.06] to-transparent p-7 shadow-inner">
          <div className="mb-4 text-xs text-accent-200/70">亲爱的作者：</div>
          <div className="whitespace-pre-wrap text-[15px] leading-8 text-ink-100">
            {letter.body}
          </div>
          <div className="mt-7 text-right text-sm text-ink-300">
            -- {characterName}
          </div>
        </article>
      </div>
    </div>
  );
}

function VirtualLetterList({
  letters,
  selectedId,
  characterMap,
  emptyText,
  onSelect,
  onPin,
  onDismiss,
}: {
  letters: CharacterLetterRecord[];
  selectedId: string | null;
  characterMap: Map<string, { id: string; name: string }>;
  emptyText: string;
  onSelect: (id: string, letter: CharacterLetterRecord) => void;
  onPin: (letter: CharacterLetterRecord) => void;
  onDismiss: (letter: CharacterLetterRecord) => void;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: letters.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    getItemKey: (index) => letters[index]?.id ?? index,
  });

  if (letters.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-lg border border-dashed border-ink-700 bg-ink-950/20 p-5 text-center text-xs leading-5 text-ink-500">
          {emptyText}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-2.5 scrollbar-thin">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const l = letters[vRow.index];
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <LetterRow
                letter={l}
                characterName={characterMap.get(l.characterId)?.name ?? "未知人物"}
                active={l.id === selectedId}
                onClick={() => onSelect(l.id, l)}
                onPin={() => onPin(l)}
                onDismiss={() => onDismiss(l)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenerateLetterDialog({
  open,
  projectId,
  characters,
  initialTone,
  onOpenCharacters,
  onClose,
  onGenerated,
}: {
  open: boolean;
  projectId: string;
  characters: { id: string; name: string }[];
  initialTone?: CharacterLetterTone;
  onOpenCharacters: () => void;
  onClose: () => void;
  onGenerated: (letter: CharacterLetterRecord) => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const buttonMotion = reduce
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const [characterId, setCharacterId] = useState<string>("");
  const [tone, setTone] = useState<CharacterLetterTone | "">(initialTone ?? "");
  const [error, setError] = useState<string | null>(null);
  const titleId = "generate-letter-title";

  useEffect(() => {
    if (!open) return;
    setCharacterId("");
    setTone(initialTone ?? "");
    setError(null);
  }, [open, initialTone]);

  const genMut = useMutation({
    mutationFn: () =>
      letterApi.generate({
        projectId,
        characterId: characterId || undefined,
        tone: tone || undefined,
      }),
    onSuccess: (letter) => onGenerated(letter),
    onError: (err) => setError(friendlyErrorMessage(err, "来信生成失败，请稍后重试。")),
  });

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="flex items-center justify-center p-4"
      panelClassName="w-full max-w-lg rounded-lg border border-ink-700 bg-ink-900 p-5 shadow-2xl"
    >
      <motion.div
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-md bg-accent-500/15 p-2 text-accent-200">
            <MailPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink-100">
              生成一封角色来信
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-400">
              可以指定人物和语气，也可以留空，让系统从已有角色中挑选最适合开口的人。
            </p>
          </div>
        </div>

        {characters.length === 0 ? (
          <div className="rounded-md border border-amber-500/45 bg-amber-500/15 p-4 text-sm text-amber-900 dark:text-amber-100">
            <div className="font-medium">还没有可写信的人物。</div>
            <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
              先去人物页创建一个角色，填写基本身份、目标或关系，再回来生成来信会更有用。
            </p>
            <button
              type="button"
              onClick={onOpenCharacters}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-600/45 bg-white/35 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/60 dark:border-amber-300/30 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10"
            >
              <UserRound className="h-3.5 w-3.5" />
              去人物页
            </button>
          </div>
        ) : (
          <>
            <label className="mb-3 block text-xs">
              <div className="mb-1.5 text-ink-400">写信人物</div>
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-ink-100"
              >
                <option value="">自动选择一位角色</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-4 block text-xs">
              <div className="mb-1.5 text-ink-400">来信语气</div>
              <select
                value={tone}
                onChange={(e) =>
                  setTone(e.target.value as CharacterLetterTone | "")
                }
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-ink-100"
              >
                <option value="">自动判断</option>
                <option value="grateful">感谢</option>
                <option value="complaint">抱怨</option>
                <option value="curious">追问</option>
                <option value="encouraging">鼓励</option>
                <option value="neutral">日常</option>
              </select>
            </label>

            {error && (
              <motion.div
                role="alert"
                className="mb-3 rounded-md bg-rose-500/10 p-2 text-[11px] text-rose-300"
                variants={reduce ? fadeOnly : fadeSlideUp}
                initial="initial"
                animate="animate"
              >
                {error}
              </motion.div>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <motion.button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
            {...buttonMotion}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            disabled={genMut.isPending || characters.length === 0}
            onClick={() => {
              setError(null);
              genMut.mutate();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:bg-ink-200 disabled:text-ink-500 disabled:opacity-100 dark:disabled:bg-ink-800 dark:disabled:text-ink-500"
            {...(genMut.isPending || characters.length === 0 ? {} : buttonMotion)}
          >
            {genMut.isPending && <MotionSpinner />}
            {genMut.isPending ? "生成中" : "生成"}
          </motion.button>
        </div>
      </motion.div>
    </AnimatedDialog>
  );
}
