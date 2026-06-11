import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterLogEntryKind,
  ChapterLogEntryRecord,
} from "@inkforge/shared";
import { chapterLogApi } from "../../lib/api";

const KIND_BADGE: Record<ChapterLogEntryKind, { label: string; cls: string }> = {
  progress: { label: "📈 进度", cls: "bg-emerald-500/20 text-emerald-200" },
  "ai-run": { label: "🤖 模型运行", cls: "bg-violet-500/20 text-violet-200" },
  manual: { label: "✍ 手记", cls: "bg-sky-500/20 text-sky-200" },
  "daily-reminder": { label: "⏰ 每日", cls: "bg-accent-500/20 text-accent-200" },
};

interface ChapterLogDrawerProps {
  chapterId: string;
  projectId: string;
  chapterTitle?: string;
  onClose: () => void;
}

export function ChapterLogDrawer({
  chapterId,
  projectId,
  chapterTitle,
  onClose,
}: ChapterLogDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const listQuery = useQuery({
    queryKey: ["chapter-log", chapterId],
    queryFn: () => chapterLogApi.list({ chapterId, limit: 100, desc: true }),
    staleTime: 5_000,
  });

  const appendMut = useMutation({
    mutationFn: (content: string) =>
      chapterLogApi.appendManual({ chapterId, projectId, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter-log", chapterId] });
      setDraft("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (entryId: string) => chapterLogApi.delete({ entryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter-log", chapterId] });
    },
  });

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    appendMut.mutate(text);
  };

  const entries = listQuery.data ?? [];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-full flex-col border-l border-ink-700 bg-ink-800 text-ink-100 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold">📓 章节日志</h3>
          {chapterTitle && (
            <div className="truncate text-[11px] text-ink-400">{chapterTitle}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
        >
          ✕
        </button>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b border-ink-700 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="今天写到这里有什么想记录的？"
          className="h-20 resize-none rounded-md border border-ink-700 bg-ink-900 p-2 text-xs text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!draft.trim() || appendMut.isPending}
            onClick={handleSubmit}
            className="rounded-md bg-accent-500/20 px-3 py-1 text-xs text-accent-200 hover:bg-accent-500/30 disabled:opacity-40"
          >
            {appendMut.isPending ? "记录中…" : "✍ 记录一笔"}
          </button>
          <span className="text-[10px] text-ink-500">{draft.length} 字</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {listQuery.isLoading && (
          <div className="py-4 text-center text-xs text-ink-500">加载中…</div>
        )}
        {listQuery.isSuccess && entries.length === 0 && (
          <div className="py-4 text-center text-xs text-ink-500">
            还没有任何条目。模型跑完一轮 / 进度更新 / 手动记录都会出现在这里。
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <LogEntryItem
              key={entry.id}
              entry={entry}
              onDelete={() => deleteMut.mutate(entry.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LogEntryItem({
  entry,
  onDelete,
}: {
  entry: ChapterLogEntryRecord;
  onDelete: () => void;
}): JSX.Element {
  const badge = KIND_BADGE[entry.kind];
  const meta = entry.metadata ?? {};
  const tokens =
    typeof meta.tokensIn === "number" || typeof meta.tokensOut === "number"
      ? `生成消耗 ${meta.tokensIn ?? 0} 输入量 / ${meta.tokensOut ?? 0} 输出量`
      : null;
  const rewrites = typeof meta.rewrites === "number" ? `重写 ${meta.rewrites} 次` : null;
  return (
    <li className="rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] text-ink-500">
          {new Date(entry.createdAt).toLocaleString()}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto text-[11px] text-ink-500 hover:text-rose-400"
          aria-label="删除日志"
          title="删除"
        >
          ✕
        </button>
      </div>
      <div className="mt-1 whitespace-pre-wrap text-ink-100">{entry.content}</div>
      {(tokens || rewrites) && (
        <div className="mt-1 flex gap-2 text-[10px] text-ink-500">
          {tokens && <span>{tokens}</span>}
          {rewrites && <span>{rewrites}</span>}
        </div>
      )}
    </li>
  );
}
