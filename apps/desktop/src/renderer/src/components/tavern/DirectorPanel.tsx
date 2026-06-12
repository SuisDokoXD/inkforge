import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, MessageSquareText, Pause, Play, Send, Users } from "lucide-react";
import type { TavernCardRecord, TavernMode, TavernSessionRecord } from "@inkforge/shared";
import { tavernEventsApi, tavernRoundApi, tavernSessionApi, tavernSummaryApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

interface DirectorPanelProps {
  session: TavernSessionRecord;
  cards: TavernCardRecord[];
}

const QUICK_DIRECTOR_PROMPTS = [
  {
    label: "追问动机",
    prompt: "追问每个角色的真实动机，不要让他们只说表面理由。",
  },
  {
    label: "反对者先发",
    prompt: "让反对者先发言，必须指出当前方案最大的风险。",
  },
  {
    label: "下一步行动",
    prompt: "要求每位角色给出一个下一步行动，而不是只评价。",
  },
  {
    label: "关系矛盾",
    prompt: "指出人物关系里最矛盾的一点，并让当事人回应。",
  },
  {
    label: "说出私心",
    prompt: "让每位角色说出一个不愿公开承认的私心。",
  },
];

export function DirectorPanel({ session, cards }: DirectorPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const autoPickedSessionRef = useRef<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  const [mode, setMode] = useState<TavernMode>(session.mode);
  const [participants, setParticipants] = useState<string[]>([]);
  const [autoRounds, setAutoRounds] = useState(3);
  const [directorMessage, setDirectorMessage] = useState("");
  const [compactKeepLastK, setCompactKeepLastK] = useState(session.lastK);
  const [compactOpen, setCompactOpen] = useState(false);

  useEffect(() => {
    setMode(session.mode);
    setAutoRounds(3);
    setDirectorMessage("");
    setCompactKeepLastK(session.lastK);
    setParticipants([]);
    setActiveRoundId(null);
    autoPickedSessionRef.current = null;
  }, [session.id, session.lastK, session.mode]);

  useEffect(() => {
    if (autoPickedSessionRef.current === session.id || cards.length === 0) return;
    setParticipants(cards.slice(0, 2).map((card) => card.id));
    autoPickedSessionRef.current = session.id;
  }, [cards, session.id]);

  useEffect(() => {
    const off = tavernEventsApi.onDone((e) => {
      if (e.sessionId === session.id && e.roundId === activeRoundId) {
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
      alert(`推进失败：${friendlyErrorMessage(err, "角色讨论暂时无法推进，请稍后重试。")}`);
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
      alert(`整理失败：${friendlyErrorMessage(err, "讨论记录整理失败，请稍后重试。")}`);
    },
  });

  const canRun = participants.length >= 1 && !runMut.isPending && !activeRoundId;

  return (
    <div className="border-t border-ink-700 bg-ink-900/85 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-200">
          <Users size={16} className="text-ink-400" />
          选择发言角色
          <span className="text-xs font-normal text-ink-500">已选 {participants.length} 位</span>
        </div>
        <div className="flex rounded-md border border-ink-700 bg-ink-950 p-0.5">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`h-7 rounded px-2.5 text-xs transition ${
              mode === "auto" ? "bg-accent-500 text-ink-950" : "text-ink-400 hover:text-ink-100"
            }`}
          >
            自动推进
          </button>
          <button
            type="button"
            onClick={() => setMode("director")}
            className={`h-7 rounded px-2.5 text-xs transition ${
              mode === "director" ? "bg-accent-500 text-ink-950" : "text-ink-400 hover:text-ink-100"
            }`}
          >
            导演引导
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {cards.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-700 px-3 py-2 text-xs text-ink-500">
            当前项目还没有可用角色卡。先到「人物」页创建角色，再回到这里推进讨论。
          </div>
        ) : (
          cards.map((card) => {
            const selected = participants.includes(card.id);
            return (
            <button
              key={card.id}
              type="button"
              onClick={() => toggleParticipant(card.id)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                selected
                  ? "border-accent-500/60 bg-accent-500/15 text-accent-100"
                  : "border-ink-700 bg-ink-950 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
              }`}
              title={`选择「${card.name}」参与讨论`}
            >
              {card.name}
            </button>
            );
          })
        )}
      </div>

      {mode === "director" && (
        <div className="mb-3 rounded-md border border-ink-700 bg-ink-950">
          <div className="flex items-center gap-2 border-b border-ink-700 px-2.5 py-1.5 text-xs text-ink-400">
            <MessageSquareText size={14} />
            给下一轮一点方向
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-ink-800 px-2.5 py-2">
            {QUICK_DIRECTOR_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setDirectorMessage(item.prompt)}
                className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-400 hover:border-accent-500/40 hover:text-accent-200"
              >
                {item.label}
              </button>
            ))}
          </div>
          <textarea
            aria-label="下一轮讨论方向"
            value={directorMessage}
            onChange={(e) => setDirectorMessage(e.target.value)}
            placeholder="例如：让他们重点讨论主角的真实动机，不要急着给结论。"
            className="h-16 w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-5 text-ink-100 outline-none placeholder:text-ink-500"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        {mode === "auto" && (
          <label className="flex h-8 items-center gap-2 rounded-md border border-ink-700 bg-ink-950 px-2 text-xs text-ink-400">
            <span>连续</span>
            <input
              aria-label="连续讨论轮数"
              type="number"
              value={autoRounds}
              onChange={(e) => setAutoRounds(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-10 bg-transparent text-center text-ink-100 outline-none"
              min={1}
              max={10}
            />
            <span>轮</span>
          </label>
        )}
        {activeRoundId ? (
          <button
            type="button"
            onClick={() => stopMut.mutate(activeRoundId)}
            disabled={stopMut.isPending}
            className="flex h-8 items-center gap-1.5 rounded-md bg-red-500/20 px-3 text-xs text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          >
            <Pause size={14} />
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => runMut.mutate()}
            disabled={!canRun}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {runMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {runMut.isPending ? "启动中" : "开始一轮"}
          </button>
        )}
        {mode === "director" && directorMessage.trim() && (
          <button
            type="button"
            onClick={() => postDirectorMut.mutate(directorMessage.trim())}
            disabled={postDirectorMut.isPending}
            className="flex h-8 items-center gap-1.5 rounded-md bg-blue-500/20 px-3 text-xs text-blue-200 hover:bg-blue-500/30 disabled:opacity-50"
          >
            <Send size={14} />
            发送引导
          </button>
        )}
        <button
          type="button"
          onClick={() => setCompactOpen(true)}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-950 px-3 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-200"
        >
          <Archive size={14} />
          整理历史
        </button>
      </div>

      {compactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-800 p-5 shadow-xl">
            <h3 className="text-sm font-medium text-accent-300 mb-3">整理历史</h3>
            <label className="block text-xs text-ink-300 mb-2">完整保留最近几条消息</label>
            <input
              aria-label="完整保留最近几条消息"
              type="number"
              value={compactKeepLastK}
              onChange={(e) => setCompactKeepLastK(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-ink-100"
              min={1}
            />
            <p className="text-[11px] text-ink-500 mt-2">
              更早的讨论会被整理成一条简短回顾。需要先配置长讨论整理服务。
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
                {compactMut.isPending ? "整理中…" : "开始整理"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
