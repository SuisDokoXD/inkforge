import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Plus, Wand2 } from "lucide-react";
import { NovelCharacterRecord, ProjectRecord } from "@inkforge/shared";
import { useAppStore } from "../../stores/app-store";
import { novelCharacterApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { staggerContainer, staggerItem, fadeOnly } from "../../lib/motion-tokens";
import { ChapterCharacterImportDialog } from "./ChapterCharacterImportDialog";
import { Badge } from "../ui";

interface NovelCharacterListProps {
  projectId: string;
  projects: ProjectRecord[];
  activeProjectId: string;
  characters: NovelCharacterRecord[];
  activeId: string | null;
  onProjectChange: (projectId: string) => void;
  onSelect: (id: string) => void;
}

export function NovelCharacterList({
  projectId,
  projects,
  activeProjectId,
  characters,
  activeId,
  onProjectChange,
  onSelect,
}: NovelCharacterListProps): JSX.Element {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    onMutate: () => setError(null),
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
    onError: (err) => {
      setError(friendlyErrorMessage(err, "新建人物失败，请先确认当前书籍是否可用。"));
    },
  });

  return (
    <div className="flex h-full flex-col bg-ink-800/40">
      <div className="border-b border-ink-700 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-accent-300">书中角色</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-7 items-center gap-1 rounded bg-ink-700/70 px-2 text-xs text-ink-200 hover:bg-ink-700"
              title="从章节识别人物"
              aria-label="从章节识别人物"
            >
              <Wand2 className="h-3.5 w-3.5" />
              识别
            </button>
            <button
              type="button"
              onClick={() => createMut.mutate()}
              className="inline-flex h-7 items-center gap-1 rounded bg-accent-500/20 px-2 text-xs text-accent-300 hover:bg-accent-500/30 disabled:opacity-60"
              disabled={createMut.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              {createMut.isPending ? "新建中" : "新建"}
            </button>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] text-ink-500">当前书籍</span>
          <select
            value={activeProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            className="h-8 w-full rounded-md border border-ink-700 bg-ink-950/70 px-2 text-xs text-ink-100 outline-none focus:border-accent-400"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] leading-5 text-red-200">
            {error}
          </div>
        ) : null}
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
                <Badge
                  tone="success"
                  className="shrink-0 rounded bg-green-500/20 px-1 font-normal text-green-400 ring-green-500/25"
                >
                  已绑定
                </Badge>
              ) : (
                <Badge
                  tone="neutral"
                  className="shrink-0 rounded bg-ink-700 px-1 font-normal text-ink-400 ring-ink-600/70"
                >
                  未绑定
                </Badge>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-ink-400">
              {char.backstory || "暂无背景..."}
            </div>
          </motion.button>
        ))}
        {characters.length === 0 && (
          <div className="flex flex-col items-center p-8 text-center text-xs leading-relaxed text-ink-500">
            <span>暂无书中人物</span>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="mt-3 inline-flex items-center gap-1 rounded border border-ink-700 px-2.5 py-1 text-ink-300 hover:bg-ink-700/40"
            >
              <Wand2 className="h-3.5 w-3.5" />
              从章节识别
            </button>
          </div>
        )}
      </motion.div>
      <ChapterCharacterImportDialog
        open={importOpen}
        projectId={projectId}
        projects={projects}
        preferredChapterId={currentChapterId}
        characters={characters}
        onProjectChange={onProjectChange}
        onClose={() => setImportOpen(false)}
        onSelectCreated={onSelect}
      />
    </div>
  );
}
