import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorldEntryRecord } from "@inkforge/shared";
import { worldApi } from "../../lib/api";

const CATEGORY_OPTIONS = ["地点", "门派", "物件", "事件", "概念"];

interface WorldEntryDetailProps {
  projectId: string;
  entry: WorldEntryRecord | null;
  onDeleted: (id: string) => void;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function WorldEntryDetail({
  projectId,
  entry,
  onDeleted,
}: WorldEntryDetailProps): JSX.Element {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) {
      setTitle("");
      setCategory(CATEGORY_OPTIONS[0]);
      setCustomCategory("");
      setAliasesText("");
      setTagsText("");
      setContent("");
      setSaveStatus(null);
      return;
    }
    setTitle(entry.title);
    if (CATEGORY_OPTIONS.includes(entry.category)) {
      setCategory(entry.category);
      setCustomCategory("");
    } else {
      setCategory("自定义");
      setCustomCategory(entry.category);
    }
    setAliasesText(entry.aliases.join("、"));
    setTagsText(entry.tags.join("、"));
    setContent(entry.content);
    setSaveStatus(null);
  }, [entry]);

  const parsedAliases = useMemo(
    () =>
      aliasesText
        .split(/[、,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [aliasesText],
  );
  const parsedTags = useMemo(
    () =>
      tagsText
        .split(/[、,\n#]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [tagsText],
  );
  const effectiveCategory = category === "自定义" ? customCategory.trim() : category;

  const isDirty = useMemo(() => {
    if (!entry) return title.trim().length > 0 || content.trim().length > 0;
    if (entry.title !== title.trim()) return true;
    if (entry.category !== effectiveCategory) return true;
    if (entry.content !== content) return true;
    if (!arraysEqual(entry.aliases, parsedAliases)) return true;
    if (!arraysEqual(entry.tags, parsedTags)) return true;
    return false;
  }, [entry, title, effectiveCategory, content, parsedAliases, parsedTags]);

  const upsertMut = useMutation({
    mutationFn: async () => {
      if (!effectiveCategory) throw new Error("分类不能为空");
      if (!title.trim()) throw new Error("标题不能为空");
      if (entry) {
        return worldApi.update({
          id: entry.id,
          category: effectiveCategory,
          title: title.trim(),
          content,
          aliases: parsedAliases,
          tags: parsedTags,
        });
      }
      return worldApi.create({
        projectId,
        category: effectiveCategory,
        title: title.trim(),
        content,
        aliases: parsedAliases,
        tags: parsedTags,
      });
    },
    onSuccess: (record) => {
      setSaveStatus(entry ? "已保存" : `已创建「${record.title}」`);
      window.setTimeout(() => setSaveStatus(null), 2400);
      void queryClient.invalidateQueries({ queryKey: ["world-entries", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["world-entry", record.id] });
    },
    onError: (err) => {
      setSaveStatus(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      window.setTimeout(() => setSaveStatus(null), 3500);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!entry) throw new Error("no entry");
      return worldApi.delete({ id: entry.id });
    },
    onSuccess: (_data) => {
      if (entry) onDeleted(entry.id);
      void queryClient.invalidateQueries({ queryKey: ["world-entries", projectId] });
    },
    onError: (err) => {
      setSaveStatus(`删除失败：${err instanceof Error ? err.message : String(err)}`);
      window.setTimeout(() => setSaveStatus(null), 3500);
    },
  });

  if (!entry && !isDirty) {
    return (
      <div className="flex flex-1 items-center justify-center border-l border-ink-700 bg-ink-900/40 text-sm text-ink-400">
        请在左侧选择或新建一个条目。
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col border-l border-ink-700 bg-ink-900/40">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-2 text-sm">
        <span className="text-ink-300">
          {entry ? "编辑条目" : "新建条目"}
          {isDirty && <span className="ml-2 text-accent-300">● 未保存</span>}
        </span>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          {saveStatus && <span>{saveStatus}</span>}
          {entry && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`确定删除「${entry.title}」？`)) {
                  deleteMut.mutate();
                }
              }}
              disabled={deleteMut.isPending}
              className="rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25 disabled:opacity-50"
            >
              删除
            </button>
          )}
          <button
            type="button"
            onClick={() => upsertMut.mutate()}
            disabled={!isDirty || upsertMut.isPending}
            className="rounded bg-accent-500 px-3 py-1 text-ink-950 font-medium hover:bg-accent-400 disabled:opacity-50"
          >
            {upsertMut.isPending ? "保存中…" : entry ? "保存" : "创建"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：青松门"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-400 mb-1">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-ink-100"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value="自定义">自定义…</option>
            </select>
          </div>
          {category === "自定义" && (
            <div>
              <label className="block text-xs text-ink-400 mb-1">自定义分类名</label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="输入新分类"
                className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100"
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">
            别名
            <span className="ml-2 text-[10px] text-ink-500">以「、」或逗号分隔</span>
          </label>
          <input
            type="text"
            value={aliasesText}
            onChange={(e) => setAliasesText(e.target.value)}
            placeholder="常用别称、旧称"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100"
          />
          {parsedAliases.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {parsedAliases.map((alias) => (
                <span
                  key={alias}
                  className="rounded bg-ink-700/40 px-2 py-[1px] text-[11px] text-ink-300"
                >
                  {alias}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">
            标签
            <span className="ml-2 text-[10px] text-ink-500">以「、」逗号或「#」分隔</span>
          </label>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="江湖、门派、剑宗"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100"
          />
          {parsedTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {parsedTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-accent-500/20 px-2 py-[1px] text-[11px] text-accent-200"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="block text-xs text-ink-400 mb-1">
            正文（支持 Markdown）
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="描述这一条目的设定、历史、与主线的关系…"
            className="min-h-[260px] w-full flex-1 resize-none rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm leading-6 text-ink-100"
          />
        </div>
      </div>
    </div>
  );
}
