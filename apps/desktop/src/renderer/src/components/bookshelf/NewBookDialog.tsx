import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

interface NewBookDialogProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功后回调，传 projectId（用于自动打开 Tab）。 */
  onCreated?: (projectId: string) => void;
}

export function NewBookDialog({
  open,
  onClose,
  onCreated,
}: NewBookDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState(1000);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      projectApi.create({
        name: name.trim(),
        dailyGoal,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onCreated?.(project.id);
      setName("");
      setDailyGoal(1000);
      setError(null);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "新建书籍失败，请检查书名后重试。")),
  });

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && dailyGoal > 0 && !createMut.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold">📖 新建一本书</h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-400">书名</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="比如：龙渊"
            maxLength={80}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) createMut.mutate();
            }}
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-400">每日字数目标</span>
          <input
            type="number"
            min={100}
            step={100}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value) || 1000)}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
          />
        </label>

        <div className="mb-3 text-[11px] text-ink-500">
          创建后会在工作目录下生成 <code className="text-ink-300">projects/{name.trim() || "<书名>"}</code>，
          含 <code className="text-ink-300">chapters/</code>、<code className="text-ink-300">characters/</code>、
          <code className="text-ink-300">world/</code> 等子目录。
        </div>

        {error && (
          <div className="mb-3 rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            className="rounded-md bg-accent-500/30 px-3 py-1.5 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
          >
            {createMut.isPending ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
