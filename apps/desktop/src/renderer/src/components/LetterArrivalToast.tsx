import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mail, MailPlus, X } from "lucide-react";
import type { CharacterLetterRecord } from "@inkforge/shared";
import { letterApi, novelCharacterApi } from "../lib/api";
import {
  dialogPanel,
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { MotionSpinner } from "./MotionSpinner";

const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const AFTER_GENERATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_LETTER_INTERVAL_MS = 6 * 60 * 60 * 1000;

type ToastMode = "nudge" | "arrived" | "error";

function storageKey(projectId: string): string {
  return `inkforge:letter-toast:${projectId}`;
}

function readLastPromptAt(projectId: string): number {
  const raw = window.localStorage.getItem(storageKey(projectId));
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastPromptAt(projectId: string, value = Date.now()): void {
  window.localStorage.setItem(storageKey(projectId), String(value));
}

export function LetterArrivalToast(): JSX.Element | null {
  const projectId = useAppStore((s) => s.currentProjectId);
  const mainView = useAppStore((s) => s.mainView);
  const setMainView = useAppStore((s) => s.setMainView);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ToastMode | null>(null);
  const [letter, setLetter] = useState<CharacterLetterRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const toastMotion = reduceMotion ? fadeOnly : dialogPanel;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const charactersQuery = useQuery({
    queryKey: ["characters", projectId],
    queryFn: () => novelCharacterApi.list({ projectId: projectId ?? "" }),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

  const lettersQuery = useQuery({
    queryKey: ["letters", projectId],
    queryFn: () => letterApi.list({ projectId: projectId ?? "" }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const letters = useMemo(() => lettersQuery.data ?? [], [lettersQuery.data]);

  useEffect(() => {
    const off = letterApi.onArrived((evt) => {
      if (!projectId || evt.projectId !== projectId) return;
      writeLastPromptAt(projectId, Date.now());
      setLetter(evt.letter);
      setError(null);
      setMode("arrived");
      queryClient.invalidateQueries({ queryKey: ["letters", projectId] });
    });
    return off;
  }, [projectId, queryClient]);

  useEffect(() => {
    if (!projectId || mainView === "letters" || mode) return;
    if (charactersQuery.isLoading || lettersQuery.isLoading) return;
    if ((charactersQuery.data ?? []).length === 0) return;

    const now = Date.now();
    const lastPromptAt = readLastPromptAt(projectId);
    if (now - lastPromptAt < NUDGE_COOLDOWN_MS) return;

    const newestLetterAt = letters.reduce((max, item) => {
      const time = new Date(item.generatedAt).getTime();
      return Number.isFinite(time) ? Math.max(max, time) : max;
    }, 0);
    if (newestLetterAt && now - newestLetterAt < MIN_LETTER_INTERVAL_MS) return;

    const unreadCount = letters.filter((item) => !item.read).length;
    if (unreadCount >= 3) return;

    const timer = window.setTimeout(() => {
      writeLastPromptAt(projectId, Date.now());
      setMode("nudge");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [
    charactersQuery.data,
    charactersQuery.isLoading,
    letters,
    lettersQuery.isLoading,
    mainView,
    mode,
    projectId,
  ]);

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("no_project");
      return letterApi.generate({ projectId });
    },
    onSuccess: async (nextLetter) => {
      if (projectId) writeLastPromptAt(projectId, Date.now() + AFTER_GENERATE_COOLDOWN_MS - NUDGE_COOLDOWN_MS);
      await queryClient.invalidateQueries({ queryKey: ["letters", projectId] });
      setLetter(nextLetter);
      setError(null);
      setMode("arrived");
    },
    onError: (err) => {
      setError(friendlyErrorMessage(err, "来信生成失败，请稍后重试。"));
      setMode("error");
    },
  });

  if (!projectId) return null;

  const close = () => setMode(null);
  const openLetters = () => {
    setMode(null);
    setMainView("letters");
  };

  return (
    <div className="pointer-events-none fixed bottom-24 right-5 z-50">
      <AnimatePresence initial={false} mode="wait">
        {mode ? (
          <motion.div
            key={mode}
            role={mode === "error" ? "alert" : "status"}
            variants={toastMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            className="pointer-events-auto w-[340px] rounded-lg border border-accent-300/20 bg-ink-900/95 p-4 shadow-2xl ring-1 ring-black/20 backdrop-blur"
          >
            <motion.button
              type="button"
              onClick={close}
              className="absolute right-2 top-2 rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
              aria-label="关闭来信提示"
              {...buttonMotion}
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </motion.button>

            {mode === "nudge" && (
              <>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-accent-500/15 p-2 text-accent-200">
                    <Mail aria-hidden className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="text-sm font-semibold text-ink-100">
                      有人物想给你写信
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink-400">
                      这只是提醒，不会自动产生生成消耗。点“收下”后才会生成正文。
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <motion.button
                    type="button"
                    onClick={close}
                    className="rounded-md px-3 py-1.5 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    {...buttonMotion}
                  >
                    稍后
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => generateMut.mutate()}
                    disabled={generateMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:cursor-default disabled:opacity-50"
                    {...(generateMut.isPending ? {} : buttonMotion)}
                  >
                    {generateMut.isPending ? (
                      <MotionSpinner className="h-3.5 w-3.5" />
                    ) : (
                      <MailPlus aria-hidden className="h-3.5 w-3.5" />
                    )}
                    {generateMut.isPending ? "生成中" : "收下这封信"}
                  </motion.button>
                </div>
              </>
            )}

            {mode === "arrived" && letter && (
              <>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-accent-500/15 p-2 text-accent-200">
                    <Mail aria-hidden className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="text-[11px] text-accent-200">新来信</div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-ink-100">
                      {letter.subject}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink-400">
                      {letter.body}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <motion.button
                    type="button"
                    onClick={close}
                    className="rounded-md px-3 py-1.5 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    {...buttonMotion}
                  >
                    先放着
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={openLetters}
                    className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400"
                    {...buttonMotion}
                  >
                    查看来信
                  </motion.button>
                </div>
              </>
            )}

            {mode === "error" && (
              <>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-rose-500/15 p-2 text-rose-200">
                    <Mail aria-hidden className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="text-sm font-semibold text-ink-100">
                      来信生成失败
                    </div>
                    <p className="mt-1 text-xs leading-5 text-rose-200/90">
                      {error ?? "请检查模型或凭证设置。"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <motion.button
                    type="button"
                    onClick={openLetters}
                    className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-800"
                    {...buttonMotion}
                  >
                    去来信页
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
