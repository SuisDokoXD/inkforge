import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChapterRecord, OutlineCardRecord } from "@inkforge/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { outlineApi } from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../lib/motion-tokens";
import { AnimatedDialog } from "./AnimatedDialog";
import { Badge, Button } from "./ui";

interface ChapterFromOutlineDialogProps {
  chapter: ChapterRecord;
  open: boolean;
  onClose: () => void;
}

export function ChapterFromOutlineDialog({
  chapter,
  open,
  onClose,
}: ChapterFromOutlineDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const flowActions = useWritingFlowActions();
  const reduceMotion = useReducedMotion() === true;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemMotion = reduceMotion ? fadeOnly : staggerItem;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const cardsQuery = useQuery({
    queryKey: ["outline-cards", chapter.projectId],
    queryFn: () => outlineApi.list({ projectId: chapter.projectId }),
    enabled: open,
  });

  const availableCards = useMemo(() => {
    const list = cardsQuery.data ?? [];
    return list
      .filter((card) => card.chapterId === null || card.chapterId === chapter.id)
      .sort((a, b) => a.order - b.order);
  }, [cardsQuery.data, chapter.id]);

  const linkedCard = useMemo(
    () => (cardsQuery.data ?? []).find((card) => card.chapterId === chapter.id),
    [cardsQuery.data, chapter.id],
  );

  useEffect(() => {
    if (!open) {
      setSelectedCardId(null);
      setError(null);
      return;
    }
    if (selectedCardId && availableCards.some((card) => card.id === selectedCardId)) return;
    setSelectedCardId(linkedCard?.id ?? availableCards[0]?.id ?? null);
  }, [availableCards, linkedCard, open, selectedCardId]);

  const selectedCard: OutlineCardRecord | undefined = availableCards.find(
    (card) => card.id === selectedCardId,
  );

  const handleContinue = async () => {
    if (!selectedCardId) return;
    setBusy(true);
    setError(null);
    try {
      await outlineApi.update({ id: selectedCardId, chapterId: chapter.id });
      await queryClient.invalidateQueries({ queryKey: ["outline-cards", chapter.projectId] });
      flowActions.autoWriteChapter(chapter.id);
      onClose();
    } catch (e) {
      setError(friendlyErrorMessage(e, "关联大纲卡失败，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      ariaLabel="从大纲进入 AI 写作"
      overlayClassName="flex items-center justify-center p-6"
      zClassName="z-50"
      panelClassName="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-md border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold">从大纲进入 AI 写作</h2>
        <span className="text-xs text-ink-400">写入「{chapter.title}」</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onClose}
          disabled={busy}
        >
          关闭
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="w-64 shrink-0 overflow-y-auto rounded-md border border-ink-700 p-2">
          <div className="mb-2 px-1 text-xs text-ink-400">
            选大纲卡（{availableCards.length} 张可选）
          </div>
          {availableCards.length === 0 ? (
            <p className="px-1 text-xs leading-5 text-ink-500">
              没有可关联的大纲卡。可以先去大纲页拆分章节，或在已关联的章节里继续写作。
            </p>
          ) : (
            <motion.ul
              className="space-y-1"
              variants={reduceMotion ? fadeOnly : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {availableCards.map((card) => (
                <motion.li key={card.id} variants={itemMotion}>
                  <motion.button
                    type="button"
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                      card.id === selectedCardId
                        ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                        : "text-ink-200 hover:bg-ink-700/60"
                    }`}
                    onClick={() => setSelectedCardId(card.id)}
                    {...buttonMotion}
                  >
                    <div className="font-medium">{card.title}</div>
                    {card.chapterId === chapter.id ? (
                      <Badge
                        tone="success"
                        className="mt-1 flex w-fit rounded bg-emerald-500/15 px-1.5 py-0 font-normal text-emerald-400 ring-emerald-500/25"
                      >
                        已关联本章
                      </Badge>
                    ) : null}
                  </motion.button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            {selectedCard ? (
              <motion.div
                key={selectedCard.id}
                className="flex-1 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-3"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-2 text-sm font-medium">{selectedCard.title}</div>
                <pre className="whitespace-pre-wrap text-xs leading-6 text-ink-200">
                  {selectedCard.content || "（空）"}
                </pre>
              </motion.div>
            ) : (
              <motion.p
                key="empty-preview"
                className="text-xs text-ink-500"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                从左侧选一张大纲卡。
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !selectedCardId}
              onClick={handleContinue}
            >
              {busy ? "准备中..." : "进入 AI 写作"}
            </Button>
          </div>
        </div>
      </div>
    </AnimatedDialog>
  );
}
