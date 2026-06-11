import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterRecord,
  ChapterGenerateFromOutlineResponse,
  OutlineCardRecord,
} from "@inkforge/shared";
import { chapterGenApi, outlineApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
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
  const setChapter = useAppStore((s) => s.setChapter);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChapterGenerateFromOutlineResponse | null>(null);

  const cardsQuery = useQuery({
    queryKey: ["outline-cards", chapter.projectId],
    queryFn: () => outlineApi.list({ projectId: chapter.projectId }),
    enabled: open,
  });

  // Show: cards already linked to THIS chapter + unlinked project-level cards.
  const availableCards = useMemo(() => {
    const list = cardsQuery.data ?? [];
    return list
      .filter((c) => c.chapterId === null || c.chapterId === chapter.id)
      .sort((a, b) => a.order - b.order);
  }, [cardsQuery.data, chapter.id]);

  const linkedCard = useMemo(
    () => (cardsQuery.data ?? []).find((c) => c.chapterId === chapter.id),
    [cardsQuery.data, chapter.id],
  );

  // Auto-select linked card if exists, else first available.
  useMemo(() => {
    if (selectedCardId) return;
    if (linkedCard) {
      setSelectedCardId(linkedCard.id);
    } else if (availableCards.length > 0) {
      setSelectedCardId(availableCards[0].id);
    }
  }, [linkedCard, availableCards, selectedCardId]);

  const handleGenerate = async () => {
    if (!selectedCardId) return;
    setBusy(true);
    setError(null);
    try {
      // For continuity, find the prev chapter (by order)
      const prev = await (async () => {
        // chapter.order - 1 in the same project
        // We don't have a "list chapters" query here; rely on caller to pass prevId? Skip for now.
        return null;
      })();
      const res = await chapterGenApi.fromOutline({
        projectId: chapter.projectId,
        outlineCardId: selectedCardId,
        candidates: candidateCount,
        prevChapterId: prev ?? undefined,
      });
      setDraft(res);
    } catch (e) {
      setError(friendlyErrorMessage(e, "生成章节失败，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const handleAdopt = async (text: string) => {
    if (!selectedCardId) return;
    setBusy(true);
    try {
      await chapterGenApi.commitDraft({
        projectId: chapter.projectId,
        text,
        title: chapter.title,
        chapterId: chapter.id,            // overwrite current chapter file
        outlineCardId: selectedCardId,
      });
      // Force the editor to reload chapter content
      await queryClient.invalidateQueries({ queryKey: ["chapter-content", chapter.id] });
      await queryClient.invalidateQueries({ queryKey: ["chapters"] });
      await queryClient.invalidateQueries({ queryKey: ["outline-cards"] });
      // Trick: temporarily switch chapter to null then back to bust EditorPane's
      // "loadedChapterIdRef" guard which otherwise blocks re-seeding content
      // for the same chapter id.
      setChapter(null);
      setTimeout(() => setChapter(chapter.id), 60);
      setDraft(null);
      onClose();
    } catch (e) {
      setError(friendlyErrorMessage(e, "采用正文失败，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const selectedCard: OutlineCardRecord | undefined = availableCards.find((c) => c.id === selectedCardId);

  return (
    <AnimatedDialog
      open={open}
      // 生成进行中（busy）时禁止通过点遮罩/Esc 关闭，避免中断写入。
      onClose={() => {
        if (!busy) onClose();
      }}
      ariaLabel="基于大纲生成本章正文"
      overlayClassName="flex items-center justify-center p-6"
      zClassName="z-50"
      panelClassName="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
    >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold">📋 基于大纲生成本章正文</h2>
          <span className="text-xs text-ink-400">写入「{chapter.title}」</span>
          <button
            className="ml-auto rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        ) : null}

        {!draft ? (
          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Left: card list */}
            <div className="w-64 shrink-0 overflow-y-auto rounded-md border border-ink-700 p-2">
              <div className="mb-2 px-1 text-xs text-ink-400">
                选大纲卡（{availableCards.length} 张可选）
              </div>
              {availableCards.length === 0 ? (
                <p className="px-1 text-xs text-ink-500">
                  尚无项目级章节大纲卡。请先去📋大纲页生成。
                </p>
              ) : (
                <ul className="space-y-1">
                  {availableCards.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                          c.id === selectedCardId
                            ? "bg-accent-500/20 text-accent-200 ring-1 ring-accent-500/40"
                            : "text-ink-200 hover:bg-ink-700/60"
                        }`}
                        onClick={() => setSelectedCardId(c.id)}
                      >
                        <div className="font-medium">{c.title}</div>
                        {c.chapterId === chapter.id ? (
                          <div className="text-[10px] text-emerald-400">已绑定本章</div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Right: card preview + controls */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="mb-2 flex shrink-0 items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  候选数
                  <select
                    className="rounded border border-ink-600 bg-ink-900 px-2 py-0.5 text-xs"
                    value={candidateCount}
                    onChange={(e) => setCandidateCount(Number(e.target.value) as 1 | 2 | 3)}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                <button
                  className="ml-auto rounded-md bg-accent-500 px-3 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
                  disabled={busy || !selectedCardId}
                  onClick={handleGenerate}
                >
                  {busy ? "生成中…" : `生成 ×${candidateCount}`}
                </button>
              </div>
              {selectedCard ? (
                <div className="flex-1 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-3">
                  <div className="mb-2 text-sm font-medium">{selectedCard.title}</div>
                  <pre className="whitespace-pre-wrap text-xs leading-6 text-ink-200">
                    {selectedCard.content || "（空）"}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-ink-500">从左侧选一张大纲卡</p>
              )}
            </div>
          </div>
        ) : (
          /* Candidate picker */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 items-center gap-3">
              <span className="text-sm">{draft.candidates.length} 个候选 · 选一份覆写本章</span>
              <button
                className="ml-auto rounded-md border border-ink-600 px-3 py-1 text-xs hover:bg-ink-700 disabled:opacity-50"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                重选
              </button>
            </div>
            <div
              className={`grid flex-1 gap-3 overflow-y-auto ${
                draft.candidates.length === 1
                  ? "grid-cols-1"
                  : draft.candidates.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {draft.candidates.map((c, i) => (
                <div key={i} className="flex flex-col rounded-md border border-ink-700 bg-ink-900/40">
                  <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-xs text-ink-400">
                    <span className="font-medium text-ink-200">候选 {i + 1}</span>
                    <span>{Array.from(c.text).filter((ch) => /\S/.test(ch)).length} 字</span>
                    <span className="ml-auto">{(c.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  <pre className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-6 text-ink-100">
                    {c.text}
                  </pre>
                  <div className="flex gap-2 border-t border-ink-700 p-2">
                    <button
                      className="flex-1 rounded-md bg-accent-500 px-3 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => handleAdopt(c.text)}
                    >
                      采用并覆写本章
                    </button>
                    <button
                      className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
                      onClick={() => navigator.clipboard.writeText(c.text)}
                    >
                      复制
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </AnimatedDialog>
  );
}
