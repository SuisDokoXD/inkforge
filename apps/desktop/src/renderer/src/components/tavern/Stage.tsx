import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TavernCardRecord, TavernMessageRecord, TavernSessionRecord } from "@inkforge/shared";
import { useAppStore } from "../../stores/app-store";
import { tavernCardApi, tavernSessionApi } from "../../lib/api";
import { ContextBudgetBar } from "./ContextBudgetBar";
import { DirectorPanel } from "./DirectorPanel";
import { RoleBubble } from "./RoleBubble";

interface StageProps {
  sessionId: string | null;
  sessions: TavernSessionRecord[];
}

export function Stage({ sessionId, sessions }: StageProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const tavernStreamBuffers = useAppStore((s) => s.tavernStreamBuffers);

  const messagesQuery = useQuery<TavernMessageRecord[]>({
    queryKey: ["tavernMessages", sessionId],
    queryFn: () =>
      sessionId
        ? tavernSessionApi.listMessages({ sessionId })
        : Promise.resolve([]),
    enabled: !!sessionId,
  });

  const cardsQuery = useQuery<TavernCardRecord[]>({
    queryKey: ["tavernCards", currentProjectId],
    queryFn: () => tavernCardApi.list({ projectId: currentProjectId || undefined }),
    enabled: !!currentProjectId,
  });

  const streamBuffer = sessionId ? tavernStreamBuffers[sessionId] : null;
  const messages = messagesQuery.data || [];
  const cards = cardsQuery.data || [];

  // Auto-scroll when new content arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, streamBuffer?.text.length]);

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-sm font-medium text-ink-200">还没有打开讨论</div>
          <p className="mt-2 max-w-sm text-xs leading-6 text-ink-500">
            从左侧新建或选择一个会话，让角色围绕某个写作问题展开讨论。
          </p>
        </div>
      </div>
    );
  }

  const session = sessions.find((s) => s.id === sessionId);
  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-500 text-sm italic">
        会话已被删除
      </div>
    );
  }

  const getCardName = (cardId: string | null) =>
    cardId ? cards.find((c) => c.id === cardId)?.name : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ContextBudgetBar sessionId={sessionId} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin px-4 py-3 space-y-2"
      >
        {messages.length === 0 && !streamBuffer && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-lg">
              <div className="text-xs text-ink-500">本场议题</div>
              <div className="mt-2 text-base font-medium leading-7 text-ink-100">{session.topic}</div>
              <p className="mt-4 text-xs leading-6 text-ink-500">
                在下方选择 1 到 6 位角色，点击「开始一轮」即可让他们发言。你可以随时切换自动推进或导演引导。
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <RoleBubble
            key={msg.id}
            message={msg}
            cardName={getCardName(msg.characterId) ?? undefined}
          />
        ))}
        {streamBuffer && streamBuffer.text.length > 0 && (
          <RoleBubble
            message={{
              id: `streaming-${streamBuffer.roundId}`,
              sessionId,
              characterId: streamBuffer.speakerCardId,
              role: "character",
              content: streamBuffer.text,
              tokensIn: 0,
              tokensOut: 0,
              createdAt: new Date().toISOString(),
            }}
            cardName={streamBuffer.speakerName}
            isStreaming
          />
        )}
      </div>

      <DirectorPanel session={session} cards={cards} />
    </div>
  );
}
