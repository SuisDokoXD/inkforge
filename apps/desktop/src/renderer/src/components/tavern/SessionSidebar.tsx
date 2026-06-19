import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { TavernSessionRecord } from "@inkforge/shared";
import { Clapperboard, Dices, Trash2 } from "lucide-react";
import { tavernSessionApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { NewSessionDialog } from "./NewSessionDialog";
import { fadeOnly } from "../../lib/motion-tokens";

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (sessionId: string) => tavernSessionApi.delete({ sessionId }),
    onSuccess: (_data, sessionId) => {
      setDeleteConfirmId(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["tavernSessions", projectId] });
      if (activeId === sessionId) onSelect(null);
    },
    onError: (err) => {
      setError(friendlyErrorMessage(err, "删除会话失败，请稍后重试。"));
    },
  });

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setError(null);
    deleteMut.mutate(sessionId);
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
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            role="alert"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex w-full items-start gap-2 border-b border-ink-700/50 p-3 text-left transition-colors ${
              activeId === s.id ? "bg-ink-700/50" : "hover:bg-ink-700/20"
            }`}
          >
            <button
              type="button"
              aria-label={`打开酒馆会话：${s.title}`}
              className="flex min-w-0 flex-1 items-start gap-2 text-left focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              onClick={() => onSelect(s.id)}
            >
              {s.mode === "director" ? (
                <Clapperboard aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
              ) : (
                <Dices aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
              )}
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
            </button>
            <AnimatePresence initial={false} mode="wait">
              {deleteConfirmId === s.id ? (
                <motion.div
                  key="delete-confirm"
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex shrink-0 flex-col items-end gap-1"
                >
                  <span className="text-[10px] text-red-300">消息不可恢复</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(null);
                      }}
                      disabled={deleteMut.isPending}
                      className="rounded px-1.5 py-0.5 text-[11px] text-ink-400 hover:bg-ink-700 disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, s.id)}
                      disabled={deleteMut.isPending}
                      className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      {deleteMut.isPending ? "删除中" : "确认删除"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="delete-start"
                  type="button"
                  aria-label={`删除酒馆会话：${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(s.id);
                  }}
                  className="shrink-0 text-xs text-ink-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                  title="删除会话"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
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
