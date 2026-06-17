import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectRecord } from "@inkforge/shared";
import { outlineGenApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

interface BookSettingsDialogProps {
  project: ProjectRecord | null;
  onClose: () => void;
  onSaved?: (project: ProjectRecord) => void;
}

/**
 * 书籍创作元数据 + 全局世界观编辑面板。
 * 复用 outlineGen.updateProjectMeta IPC（v20 已扩 globalWorldview 字段）。
 *
 * - 简介 / 类型 / 子类型 / 标签 → 已写章节生成大纲时使用
 * - **全局世界观（重点）** → 续写精修时自动注入
 */
export function BookSettingsDialog({
  project,
  onClose,
  onSaved,
}: BookSettingsDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("");
  const [subGenre, setSubGenre] = useState("");
  const [tags, setTags] = useState("");
  const [globalWorldview, setGlobalWorldview] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setSynopsis(project.synopsis ?? "");
      setGenre(project.genre ?? "");
      setSubGenre(project.subGenre ?? "");
      setTags((project.tags ?? []).join(", "));
      setGlobalWorldview(project.globalWorldview ?? "");
      setError(null);
    }
  }, [project]);

  const saveMut = useMutation({
    mutationFn: () =>
      outlineGenApi.updateProjectMeta({
        projectId: project!.id,
        synopsis,
        genre,
        subGenre,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        globalWorldview,
      }),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onSaved?.(next);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "保存书籍设定失败，请稍后重试。")),
  });

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">⚙ 设定 ·《{project.name}》</h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-400">类型（如：玄幻 / 科幻 / 都市）</span>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-400">子类型</span>
            <input
              type="text"
              value={subGenre}
              onChange={(e) => setSubGenre(e.target.value)}
              className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-ink-400">标签（逗号分隔）</span>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="比如：穿越, 群像, 慢热"
            className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-ink-400">简介 / Synopsis</span>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={3}
            placeholder="一段话讲清你这本书在写什么。生成大纲时会作为种子使用。"
            className="w-full resize-none rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-xs text-ink-400">
            <span className="rounded bg-accent-500/30 px-1.5 py-0.5 text-accent-100">
              🌍 全局世界观
            </span>
            <span>
              续写精修每段开始前都会参考这一段；建议写：时代背景 / 力量体系 / 政治格局 / 关键禁忌
            </span>
          </span>
          <textarea
            value={globalWorldview}
            onChange={(e) => setGlobalWorldview(e.target.value)}
            rows={10}
            placeholder={`例如：\n这是一个修真复辟的近未来世界。元婴期以下不得乘坐空艇；元婴以上对凡人施法即斩。\n大乘期共 11 人，号「十一灯」，每人对应一州……`}
            className="w-full resize-none rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono"
          />
          <span className="mt-1 block text-[11px] text-ink-500">
            {globalWorldview.length} 字
            {globalWorldview.length > 4000 && (
              <span className="ml-2 text-accent-300">
                ⚠ 内容偏长，模型生成成本会上升；建议控制在 2000 字内
              </span>
            )}
          </span>
        </label>

        {error && (
          <div className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">
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
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="rounded-md bg-accent-500/30 px-3 py-1.5 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
          >
            {saveMut.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
