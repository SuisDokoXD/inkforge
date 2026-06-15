import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ChapterRecord, OutlineCardRecord } from "@inkforge/shared";
import { chapterApi, chapterGenApi, outlineApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

function getPendingCards(cards: OutlineCardRecord[]): OutlineCardRecord[] {
  return cards
    .filter((card) => !card.chapterId)
    .sort((a, b) => a.order - b.order);
}

function getOrderedCards(cards: OutlineCardRecord[]): OutlineCardRecord[] {
  return [...cards].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function getWrittenCards(cards: OutlineCardRecord[]): OutlineCardRecord[] {
  return cards.filter((card) => !!card.chapterId);
}

function getPreviousWrittenChapterId(cards: OutlineCardRecord[], card: OutlineCardRecord): string | undefined {
  const writtenBefore = cards
    .filter((c) => c.chapterId && c.order < card.order)
    .sort((a, b) => b.order - a.order);
  return writtenBefore[0]?.chapterId ?? undefined;
}

async function refreshCommittedChapter(
  queryClient: QueryClient,
  projectId: string,
  chapterId: string,
): Promise<void> {
  const readBack = await chapterApi.read({ id: chapterId });
  queryClient.setQueryData(["chapter-content", chapterId], readBack);
  queryClient.setQueryData<ChapterRecord[]>(["chapters", projectId], (old) =>
    old?.map((chapter) => chapter.id === chapterId ? readBack.chapter : chapter) ?? old,
  );
  queryClient.removeQueries({ queryKey: ["chapter-heading-outline", chapterId] });
  queryClient.invalidateQueries({ queryKey: ["chapter-read-for-rewrite", chapterId] });
  queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
}

/**
 * v22+: 批量章节生成 + 断点续写。
 *
 * 设计：
 * - 不引入新 IPC / 不改 main 进程；纯前端串行编排现有
 *   `chapterGen.fromOutline` + `chapterGen.commitDraft`。
 * - "补完未写"每轮重新 list 大纲卡，只挑选 chapterId === null 的卡逐张生成。
 *   于是断点续写是天然的：哪怕用户中途关闭应用，下次再点"继续"，仍会
 *   从首张未写卡片接着跑。
 * - "重写全部"按章节卡顺序重新生成每张卡对应正文。已有章节由主进程先保存
 *   pre-rewrite 版本备份，再覆盖正文。
 * - 上一张已写卡的 chapterId 会作为 prevChapterId 传给 fromOutline，
 *   保证跨章节衔接。
 * - 暂停/停止：通过 ref 标记，循环每步检查；正在进行的那一次 LLM 调用
 *   会跑完（无法中途中断流式响应），但不会再发起下一张。
 *
 * 限制：
 * - 全程会持续占用 LLM 配额；429/网络错误会让本张失败并停止流程，
 *   重新点击"继续"即可。
 * - 候选数固定 1（节省 token），需要多候选请走单卡入口。
 */

interface Props {
  projectId: string;
  cards: OutlineCardRecord[];
  sampleLibIds?: string[];
  /** 父组件全局 busy 标志：批量进行时禁用其他按钮 */
  onBusyChange?: (busy: boolean) => void;
}

type Status = "idle" | "running" | "paused" | "stopped" | "error" | "done";
type RunMode = "fill" | "rewrite";

interface ProgressLine {
  cardId: string;
  cardTitle: string;
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

export function BulkChapterGenerator({
  projectId,
  cards,
  sampleLibIds,
  onBusyChange,
}: Props): JSX.Element | null {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>("idle");
  const [activeMode, setActiveMode] = useState<RunMode>("fill");
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  const [maxBatch, setMaxBatch] = useState<number>(0); // 0 = 不限
  const [error, setError] = useState<string | null>(null);

  // 控制 flags：用 ref 在闭包外随时翻转
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  const pending = useMemo(
    () => getPendingCards(cards),
    [cards],
  );
  const written = useMemo(() => getWrittenCards(cards), [cards]);

  useEffect(() => {
    onBusyChange?.(status === "running");
  }, [status, onBusyChange]);

  const start = async (mode: RunMode) => {
    if (runningRef.current) return;
    if (mode === "rewrite") {
      const ok = window.confirm(
        `重新生成全部 ${cards.length} 张章节卡对应的正文？\n\n已有章节会先保存为“重写前”版本备份，然后被新正文覆盖。`,
      );
      if (!ok) return;
    }
    runningRef.current = true;
    cancelRef.current = false;
    pauseRef.current = false;
    setActiveMode(mode);
    setStatus("running");
    setError(null);
    setProgress([]);

    let processed = 0;
    let lastChapterId: string | undefined;
    const processedIds = new Set<string>();
    const limit = mode === "rewrite" ? Infinity : maxBatch > 0 ? maxBatch : Infinity;

    try {
      while (processed < limit) {
        if (cancelRef.current) {
          setStatus("stopped");
          break;
        }
        // 暂停时轮询等待
        while (pauseRef.current && !cancelRef.current) {
          setStatus("paused");
          await sleep(300);
        }
        if (cancelRef.current) {
          setStatus("stopped");
          break;
        }
        setStatus("running");

        // 每一轮重新 list 一次，避免本地 cards 缓存过期：
        // 用户可能并行手写了一章，或前面循环刚落盘但 props 还没刷新。
        const fresh = await outlineApi.list({ projectId });
        const ordered = (mode === "rewrite" ? getOrderedCards(fresh) : getPendingCards(fresh))
          .filter((card) => !processedIds.has(card.id));
        if (ordered.length === 0) {
          setStatus("done");
          break;
        }

        const card = ordered[0];
        const prevChapterId =
          mode === "rewrite"
            ? lastChapterId ?? getPreviousWrittenChapterId(fresh, card)
            : getPreviousWrittenChapterId(fresh, card);

        appendProgress(card, "running");

        try {
          const res = await chapterGenApi.fromOutline({
            projectId,
            outlineCardId: card.id,
            candidates: 1,
            prevChapterId,
            sampleLibIds: sampleLibIds && sampleLibIds.length > 0 ? sampleLibIds : undefined,
          });
          const candidate = res.candidates[0];
          if (!candidate || !candidate.text.trim()) {
            throw new Error("模型没有返回正文");
          }
          const committed = await chapterGenApi.commitDraft({
            projectId,
            text: candidate.text,
            title: res.outlineTitle,
            outlineCardId: card.id,
            chapterId: mode === "rewrite" ? card.chapterId ?? undefined : undefined,
          });
          await refreshCommittedChapter(queryClient, projectId, committed.chapterId);
          processedIds.add(card.id);
          lastChapterId = committed.chapterId;
          markProgress(
            card.id,
            "done",
            mode === "rewrite"
              ? `${candidate.text.length} 字 · 已覆盖`
              : `${candidate.text.length} 字 · ${candidate.durationMs}ms`,
          );
          processed += 1;
          // 让卡片列表与章节列表都刷新一次，UI 实时显示进度
          queryClient.invalidateQueries({ queryKey: ["outline-cards", projectId] });
          queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
        } catch (e) {
          const msg = friendlyErrorMessage(e, "生成本章失败，请稍后重试。");
          markProgress(card.id, "failed", msg);
          setError(msg);
          setStatus("error");
          break;
        }
      }

      // 全部完成（或退出循环）。如果不是 stopped/error，则视为 done
      setStatus((prev) =>
        prev === "stopped" || prev === "error" ? prev : "done",
      );
    } finally {
      runningRef.current = false;
    }
  };

  const pause = () => {
    pauseRef.current = true;
  };
  const resume = () => {
    pauseRef.current = false;
    if (!runningRef.current) {
      // 已经 idle / stopped → 重新启动整轮（断点续写）
      void start(activeMode);
    }
  };
  const stop = () => {
    cancelRef.current = true;
    pauseRef.current = false;
  };

  const appendProgress = (card: OutlineCardRecord, s: ProgressLine["status"]) => {
    setProgress((prev) => {
      const exists = prev.find((p) => p.cardId === card.id);
      if (exists) {
        return prev.map((p) =>
          p.cardId === card.id ? { ...p, status: s } : p,
        );
      }
      return [...prev, { cardId: card.id, cardTitle: card.title, status: s }];
    });
  };

  const markProgress = (
    cardId: string,
    s: ProgressLine["status"],
    message?: string,
  ) => {
    setProgress((prev) =>
      prev.map((p) =>
        p.cardId === cardId ? { ...p, status: s, message } : p,
      ),
    );
  };

  const totalCards = cards.length;
  if (totalCards === 0) return null;

  const hasPending = pending.length > 0;
  const showResumeHint = status === "idle" && hasPending && written.length > 0;
  const isBusy = status === "running" || status === "paused";

  return (
    <section className="rounded-md border border-accent-500/30 bg-accent-500/5 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-accent-500/20 px-2 py-0.5 text-xs font-semibold text-accent-100">
          📚 批量写作
        </span>
        <span className="text-xs text-ink-300">
          已写 <strong className="text-emerald-300">{written.length}</strong> / 总{" "}
          <strong>{totalCards}</strong>
          {hasPending && (
            <>
              {" "}
              · 剩余 <strong className="text-accent-300">{pending.length}</strong> 张
            </>
          )}
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs text-ink-300">
          补写最多
          <input
            type="number"
            aria-label="本次最多补写章节数"
            min={0}
            max={50}
            step={1}
            value={maxBatch}
            disabled={status === "running" || status === "paused"}
            onChange={(e) => setMaxBatch(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
            className="w-16 rounded-md border border-ink-600 bg-ink-900 px-2 py-0.5 text-xs"
          />
          <span className="text-ink-500">章（0 = 不限）</span>
        </label>
      </header>

      {showResumeHint && (
        <p className="mb-2 rounded-md bg-accent-500/10 px-2 py-1 text-[11px] text-accent-200">
          🕒 检测到上次还有 {pending.length} 张未写完。点击「继续 / 启动」会从第{" "}
          {pending[0].order} 张「{pending[0].title}」接着写。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status !== "running" && status !== "paused" && (
          <>
            <button
              type="button"
              disabled={!hasPending}
              onClick={() => void start("fill")}
              className="rounded-md bg-accent-500 px-3 py-1 text-xs font-semibold text-ink-900 hover:bg-accent-400 disabled:opacity-40"
            >
              {written.length > 0 ? `▶ 继续批量（从第 ${pending[0]?.order ?? 1} 章）` : "🚀 启动批量生成"}
            </button>
            <button
              type="button"
              disabled={totalCards === 0}
              onClick={() => void start("rewrite")}
              className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
            >
              ↻ 重写全部正文
            </button>
          </>
        )}
        {status === "running" && (
          <button
            type="button"
            onClick={pause}
            className="rounded-md bg-sky-500/30 px-3 py-1 text-xs text-sky-100 hover:bg-sky-500/40"
          >
            ⏸ 暂停
          </button>
        )}
        {status === "paused" && (
          <button
            type="button"
            onClick={resume}
            className="rounded-md bg-accent-500 px-3 py-1 text-xs font-semibold text-ink-900 hover:bg-accent-400"
          >
            ▶ 继续
          </button>
        )}
        {(status === "running" || status === "paused") && (
          <button
            type="button"
            onClick={stop}
            className="rounded-md border border-rose-500/50 bg-rose-500/20 px-3 py-1 text-xs text-rose-100 hover:bg-rose-500/30"
          >
            ⏹ 停止
          </button>
        )}
        <span
          className={`ml-auto text-[11px] ${
            status === "error"
              ? "text-rose-300"
              : status === "done"
                ? "text-emerald-300"
                : status === "running"
                  ? "text-accent-300"
                  : "text-ink-400"
          }`}
        >
          {status === "idle" && "待启动"}
          {status === "running" && (activeMode === "rewrite" ? "正在重写全部正文…" : "正在批量生成…")}
          {status === "paused" && "已暂停"}
          {status === "stopped" && "已手动停止"}
          {status === "error" && "出错（可继续）"}
          {status === "done" && (activeMode === "rewrite" ? "✓ 重写完成" : "✓ 本次完成")}
        </span>
      </div>

      {!isBusy && totalCards > 0 ? (
        <p className="mt-2 text-[11px] leading-5 text-ink-500">
          重写全部会按当前章纲顺序覆盖已有正文；覆盖前会自动保存“重写前”版本备份。
        </p>
      ) : null}

      {error && (
        <div className="mt-2 rounded bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
          {error}
        </div>
      )}

      {progress.length > 0 && (
        <ul className="mt-2 max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/50 p-2 text-[11px] scrollbar-thin">
          {progress.map((p) => (
            <li key={p.cardId} className="flex items-center gap-2">
              <span
                className={
                  p.status === "done"
                    ? "text-emerald-300"
                    : p.status === "failed"
                      ? "text-rose-300"
                      : p.status === "running"
                        ? "text-accent-300"
                        : "text-ink-400"
                }
              >
                {p.status === "done" ? "✓" : p.status === "failed" ? "✗" : p.status === "running" ? "…" : "·"}
              </span>
              <span className="truncate text-ink-200">{p.cardTitle}</span>
              {p.message && <span className="ml-auto text-ink-500">{p.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
