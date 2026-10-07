import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "../components/ui";
import { useAppStore } from "../stores/app-store";
import { tavernSessionApi, tavernEventsApi } from "../lib/api";
import { SessionSidebar } from "../components/tavern/SessionSidebar";
import { Stage } from "../components/tavern/Stage";

export function TavernPage(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const activeTavernSessionId = useAppStore((s) => s.activeTavernSessionId);
  const setActiveTavernSessionId = useAppStore((s) => s.setActiveTavernSessionId);
  const updateTavernStreamBuffer = useAppStore((s) => s.updateTavernStreamBuffer);
  const setTavernBudgetState = useAppStore((s) => s.setTavernBudgetState);
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["tavernSessions", currentProjectId],
    queryFn: () =>
      currentProjectId
        ? tavernSessionApi.list({ projectId: currentProjectId })
        : Promise.resolve([]),
    enabled: !!currentProjectId,
  });

  // Subscribe to tavern streaming events
  useEffect(() => {
    const offChunk = tavernEventsApi.onChunk((e) => {
      updateTavernStreamBuffer(e.sessionId, {
        roundId: e.roundId,
        speakerCardId: e.speakerCardId,
        speakerName: e.speakerName,
        text: e.accumulatedText,
      });
    });
    const offDone = tavernEventsApi.onDone((e) => {
      // clear buffer & refresh messages
      updateTavernStreamBuffer(e.sessionId, null);
      queryClient.invalidateQueries({ queryKey: ["tavernMessages", e.sessionId] });
    });
    const offBudget = tavernEventsApi.onBudgetWarning((e) => {
      if (e.state) {
        setTavernBudgetState(e.sessionId, e.state);
      } else {
        setTavernBudgetState(e.sessionId, {
          sessionId: e.sessionId,
          budgetTokens: 0,
          usedTokens: 0,
          remainingTokens: e.remainingTokens,
          shouldWarn: true,
          warnAt: e.emittedAt,
        });
      }
    });
    return () => {
      offChunk?.();
      offDone?.();
      offBudget?.();
    };
  }, [updateTavernStreamBuffer, setTavernBudgetState, queryClient]);

  if (!currentProjectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-lg text-accent-300">
            <MessageCircle aria-hidden className="h-5 w-5" />
            酒馆舞台
          </div>
          <p className="text-sm text-ink-300">请先在侧边栏选择或创建一个项目以开启酒馆会话。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface feature-workspace flex h-full w-full flex-col bg-ink-900 overflow-hidden">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-800/55 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3"><MessageCircle className="h-5 w-5 text-accent-300" aria-hidden="true" /><div className="min-w-0"><h2 className="truncate text-base font-semibold text-ink-100">酒馆会话</h2><p className="mt-1 text-xs text-ink-500">让多个角色围绕当前问题协作</p></div></div>
        <Button size="sm" variant="accentSoft" onClick={() => window.dispatchEvent(new Event("inkforge:create-tavern-session"))}><Plus className="h-3.5 w-3.5" />新建会话</Button>
      </header>
      <div className="flex min-h-0 flex-1">
      <aside className="w-[260px] shrink-0 border-r border-ink-700">
        <SessionSidebar
          projectId={currentProjectId}
          sessions={sessionsQuery.data || []}
          activeId={activeTavernSessionId}
          onSelect={setActiveTavernSessionId}
        />
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <Stage sessionId={activeTavernSessionId} sessions={sessionsQuery.data || []} />
      </main>
      </div>
    </div>
  );
}
