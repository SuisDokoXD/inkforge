import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChapterRecord, OutlineCardRecord } from "@inkforge/shared";
import { outlineApi } from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { AnimatedDialog } from "./AnimatedDialog";

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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (selectedCardId) return;
    if (linkedCard) {
      setSelectedCardId(linkedCard.id);
    } else if (availableCards.length > 0) {
      setSelectedCardId(availableCards[0].id);
    }
  }, [availableCards, linkedCard, selectedCardId]);

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
        <button
          className="ml-auto rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700 disabled:opacity-50"
          onClick={onClose}
          disabled={busy}
        >
          关闭
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

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
            <ul className="space-y-1">
              {availableCards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                      card.id === selectedCardId
                        ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                        : "text-ink-200 hover:bg-ink-700/60"
                    }`}
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    <div className="font-medium">{card.title}</div>
                    {card.chapterId === chapter.id ? (
                      <div className="text-[10px] text-emerald-400">已关联本章</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedCard ? (
            <div className="flex-1 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-3">
              <div className="mb-2 text-sm font-medium">{selectedCard.title}</div>
              <pre className="whitespace-pre-wrap text-xs leading-6 text-ink-200">
                {selectedCard.content || "（空）"}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-ink-500">从左侧选一张大纲卡。</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              className="ml-auto rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-50"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
              disabled={busy || !selectedCardId}
              onClick={handleContinue}
            >
              {busy ? "准备中..." : "进入 AI 写作"}
            </button>
          </div>
        </div>
      </div>
    </AnimatedDialog>
  );
}
