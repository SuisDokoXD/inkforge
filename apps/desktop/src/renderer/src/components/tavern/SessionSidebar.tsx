import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TavernSessionRecord } from "@inkforge/shared";
import { tavernSessionApi } from "../../lib/api";
import { NewSessionDialog } from "./NewSessionDialog";

interface SessionSidebarProps {
  projectId: string;
  sessions: TavernSessionRecord[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function SessionSidebar({
  projectId,
  sessions,
  activeId,
  onSelect,
}: SessionSidebarProps): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (sessionId: string) => tavernSessionApi.delete({ sessionId }),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["tavernSessions", projectId] });
      if (activeId === sessionId) onSelect(null);
    },
  });

  const handleDelete = (e: React.MouseEvent, sessionId: string, title: string) => {
    e.stopPropagation();
    if (confirm(`确定删除会话「${title}」？所有消息将不可恢复。`)) {
      deleteMut.mutate(sessionId);
    }
  };

  return (
    <div className="flex h-full flex-col bg-ink-800/40">
      <div className="flex items-center justify-between border-b border-ink-700 p-3">
        <h2 className="text-sm font-medium text-accent-300">酒馆会话</h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded bg-accent-500/20 px-2 py-1 text-xs text-accent-300 hover:bg-accent-500/30"
        >
          + 新建
        </button>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {sessions.map((s) => (
          <div
            key={s.id}
            role="button"
            aria-label={`打开酒馆会话：${s.title}`}
            tabIndex={0}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(s.id);
            }}
            className={`group flex w-full cursor-pointer items-start gap-2 p-3 text-left transition-colors border-b border-ink-700/50 ${
              activeId === s.id ? "bg-ink-700/50" : "hover:bg-ink-700/20"
            }`}
          >
            <span className="mt-0.5 text-base shrink-0">
              {s.mode === "director" ? "🎬" : "🎲"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink-100">{s.title}</div>
              <div className="mt-0.5 truncate text-[11px] text-ink-400">
                {s.topic.slice(0, 30)}
                {s.topic.length > 30 ? "…" : ""}
              </div>
              <div className="mt-0.5 text-[10px] text-ink-500">
                讨论记忆 {s.budgetTokens} · 保留最近 {s.lastK} 条
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => handleDelete(e, s.id, s.title)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-xs text-ink-500 hover:text-red-400 transition"
              title="删除会话"
            >
              🗑
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="p-8 text-center text-xs text-ink-500">
            暂无会话。点击右上角「+ 新建」开始。
          </div>
        )}
      </div>
      <NewSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        onCreated={(sessionId) => {
          onSelect(sessionId);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
