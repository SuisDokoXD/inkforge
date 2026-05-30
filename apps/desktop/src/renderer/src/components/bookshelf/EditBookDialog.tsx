import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectRecord } from "@inkforge/shared";
import { projectApi } from "../../lib/api";

interface EditBookDialogProps {
  /** 当前要编辑的书籍。null 时对话框隐藏。 */
  project: ProjectRecord | null;
  onClose: () => void;
  onSaved?: (project: ProjectRecord) => void;
}

/**
 * 修改书籍基础信息（书名、日均目标）。深度信息（世界观/简介）走 BookSettingsDialog。
 */
export function EditBookDialog({
  project,
  onClose,
  onSaved,
}: EditBookDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState(1000);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDailyGoal(project.dailyGoal);
      setError(null);
    }
  }, [project]);

  const updateMut = useMutation({
    mutationFn: () =>
      projectApi.update({
        id: project!.id,
        name: name.trim(),
        dailyGoal,
      }),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onSaved?.(next);
      onClose();
    },
    onError: (err) => setError(String(err)),
  });

  if (!project) return null;
  const canSubmit =
    name.trim().length > 0 && dailyGoal > 0 && !updateMut.isPending;
  const dirty = name.trim() !== project.name || dailyGoal !== project.dailyGoal;

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
        <h3 className="mb-3 text-base font-semibold">✏ 编辑书籍信息</h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-400">书名</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit && dirty) updateMut.mutate();
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
          注意：改名只更新数据库元数据，不会改动磁盘上的项目目录路径。
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
            onClick={() => updateMut.mutate()}
            disabled={!canSubmit || !dirty}
            className="rounded-md bg-accent-500/30 px-3 py-1.5 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
          >
            {updateMut.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
