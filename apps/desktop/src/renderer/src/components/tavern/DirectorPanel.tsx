import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TavernCardRecord, TavernMode, TavernSessionRecord } from "@inkforge/shared";
import { tavernEventsApi, tavernRoundApi, tavernSessionApi, tavernSummaryApi } from "../../lib/api";

interface DirectorPanelProps {
  session: TavernSessionRecord;
  cards: TavernCardRecord[];
}

export function DirectorPanel({ session, cards }: DirectorPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  const [mode, setMode] = useState<TavernMode>(session.mode);
  const [participants, setParticipants] = useState<string[]>([]);
  const [autoRounds, setAutoRounds] = useState(3);
  const [directorMessage, setDirectorMessage] = useState("");
  const [compactKeepLastK, setCompactKeepLastK] = useState(session.lastK);
  const [compactOpen, setCompactOpen] = useState(false);

  // Clear active round when a round completes (listen for tavern:done)
  useEffect(() => {
    const off = tavernEventsApi.onDone((e) => {
      if (e.sessionId === session.id && e.roundId === activeRoundId) {
        // Clear when the final speaker of this round reports done-of-round (heuristic: any done clears)
        setActiveRoundId((prev) => (prev === e.roundId ? null : prev));
      }
    });
    return () => {
      off?.();
    };
  }, [session.id, activeRoundId]);

  const toggleParticipant = (cardId: string) => {
    setParticipants((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    );
  };

  const runMut = useMutation({
    mutationFn: () =>
      tavernRoundApi.run({
        sessionId: session.id,
        mode,
        participants,
        lastK: session.lastK,
        autoRounds: mode === "auto" ? autoRounds : undefined,
        directorMessage: mode === "director" && directorMessage.trim() ? directorMessage.trim() : undefined,
      }),
    onSuccess: (res) => {
      setActiveRoundId(res.roundId);
      setDirectorMessage("");
    },
    onError: (err) => {
      alert(`推进失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const stopMut = useMutation({
    mutationFn: (roundId: string) => tavernRoundApi.stop({ roundId }),
    onSuccess: () => setActiveRoundId(null),
  });

  const postDirectorMut = useMutation({
    mutationFn: (content: string) =>
      tavernSessionApi.postDirector({ sessionId: session.id, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tavernMessages", session.id] });
      setDirectorMessage("");
    },
  });

  const compactMut = useMutation({
    mutationFn: (keepLastK: number) =>
      tavernSummaryApi.compact({ sessionId: session.id, keepLastK }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tavernMessages", session.id] });
      setCompactOpen(false);
    },
    onError: (err) => {
      alert(`压缩失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const canRun = participants.length >= 1 && !runMut.isPending && !activeRoundId;

  return (
    <div className="border-t border-ink-700 bg-ink-800/40 p-3 space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-ink-400">模式:</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="tavern-mode"
            checked={mode === "director"}
            onChange={() => setMode("director")}
            className="accent-accent-500"
          />
          <span className="text-ink-200">导演</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="tavern-mode"
            checked={mode === "auto"}
            onChange={() => setMode("auto")}
            className="accent-accent-500"
          />
          <span className="text-ink-200">自动</span>
        </label>
        {mode === "auto" && (
          <label className="flex items-center gap-1 ml-4">
            <span className="text-ink-400">轮数:</span>
            <input
              type="number"
              value={autoRounds}
              onChange={(e) => setAutoRounds(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-12 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-ink-100 text-xs"
              min={1}
              max={10}
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cards.length === 0 && (
          <span className="text-xs text-ink-500 italic">当前项目无可用角色卡</span>
        )}
        {cards.map((card) => {
          const selected = participants.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => toggleParticipant(card.id)}
              className={`rounded px-2 py-1 text-xs transition ${
                selected
                  ? "bg-accent-500/20 text-accent-200 border border-accent-500/50"
                  : "bg-ink-900/60 text-ink-400 border border-ink-700 hover:bg-ink-900"
              }`}
              title={`${card.providerId}/${card.model}`}
            >
              {selected ? "✓ " : ""}
              {card.name}
            </button>
          );
        })}
      </div>

      {mode === "director" && (
        <textarea
          value={directorMessage}
          onChange={(e) => setDirectorMessage(e.target.value)}
          placeholder="导演指令（可选）：对角色下一步发言的引导"
          className="w-full rounded border border-ink-700 bg-ink-900 px-2 py-1.5 text-xs text-ink-100 resize-none h-12"
        />
      )}

      <div className="flex items-center gap-2">
        {activeRoundId ? (
          <button
            type="button"
            onClick={() => stopMut.mutate(activeRoundId)}
            disabled={stopMut.isPending}
            className="rounded bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          >
            ⏸ 停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => runMut.mutate()}
            disabled={!canRun}
            className="rounded bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
          >
            ▶ {runMut.isPending ? "启动中…" : "推进"}
          </button>
        )}
        {mode === "director" && directorMessage.trim() && (
          <button
            type="button"
            onClick={() => postDirectorMut.mutate(directorMessage.trim())}
            disabled={postDirectorMut.isPending}
            className="rounded bg-blue-500/20 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/30 disabled:opacity-50"
          >
            📣 发送指令
          </button>
        )}
        <button
          type="button"
          onClick={() => setCompactOpen(true)}
          className="ml-auto rounded bg-ink-700/60 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
        >
          📜 压缩历史
        </button>
      </div>

      {compactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-800 p-5 shadow-xl">
            <h3 className="text-sm font-medium text-accent-300 mb-3">压缩历史</h3>
            <label className="block text-xs text-ink-300 mb-2">保留最近 K 条完整消息</label>
            <input
              type="number"
              value={compactKeepLastK}
              onChange={(e) => setCompactKeepLastK(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-ink-100"
              min={1}
            />
            <p className="text-[11px] text-ink-500 mt-2">
              早于这 {compactKeepLastK} 条的非摘要消息将被摘要模型压缩为一条摘要消息。需要会话配置摘要 Provider。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompactOpen(false)}
                className="rounded px-3 py-1.5 text-xs text-ink-400 hover:text-ink-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => compactMut.mutate(compactKeepLastK)}
                disabled={compactMut.isPending}
                className="rounded bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
              >
                {compactMut.isPending ? "压缩中…" : "开始压缩"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
