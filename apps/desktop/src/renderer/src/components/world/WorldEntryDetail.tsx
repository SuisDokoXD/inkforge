import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { WorldEntryRecord } from "@inkforge/shared";
import { worldApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly } from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";

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

interface WorldEntrySnapshot {
  title: string;
  category: string;
  content: string;
  aliases: string[];
  tags: string[];
}

function emptyEntrySnapshot(): WorldEntrySnapshot {
  return {
    title: "",
    category: CATEGORY_OPTIONS[0],
    content: "",
    aliases: [],
    tags: [],
  };
}

function snapshotFromEntry(entry: WorldEntryRecord): WorldEntrySnapshot {
  return {
    title: entry.title,
    category: entry.category,
    content: entry.content,
    aliases: [...entry.aliases],
    tags: [...entry.tags],
  };
}

function snapshotsEqual(a: WorldEntrySnapshot, b: WorldEntrySnapshot): boolean {
  return (
    a.title === b.title &&
    a.category === b.category &&
    a.content === b.content &&
    arraysEqual(a.aliases, b.aliases) &&
    arraysEqual(a.tags, b.tags)
  );
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
  const { status: saveStatus, showStatus: showSaveStatus } = useTimedStatus();
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [syncedSnapshot, setSyncedSnapshot] = useState<WorldEntrySnapshot>(() => emptyEntrySnapshot());
  const loadedEntryIdRef = useRef<string | null>(null);
  const syncedUpdatedAtRef = useRef("");

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

  const currentSnapshot = useMemo<WorldEntrySnapshot>(
    () => ({
      title: title.trim(),
      category: effectiveCategory,
      content,
      aliases: parsedAliases,
      tags: parsedTags,
    }),
    [title, effectiveCategory, content, parsedAliases, parsedTags],
  );
  const isDirty = !snapshotsEqual(currentSnapshot, syncedSnapshot);

  useEffect(() => {
    if (!entry) {
      const nextSnapshot = emptyEntrySnapshot();
      loadedEntryIdRef.current = null;
      syncedUpdatedAtRef.current = "";
      if (!snapshotsEqual(nextSnapshot, syncedSnapshot)) {
        setSyncedSnapshot(nextSnapshot);
      }
      setDeleteConfirming(false);
      setTitle("");
      setCategory(CATEGORY_OPTIONS[0]);
      setCustomCategory("");
      setAliasesText("");
      setTagsText("");
      setContent("");
      showSaveStatus(null);
      return;
    }

    const isSameEntry = loadedEntryIdRef.current === entry.id;
    const nextSnapshot = snapshotFromEntry(entry);
    const isStaleExternalEntry =
      isSameEntry &&
      syncedUpdatedAtRef.current.length > 0 &&
      entry.updatedAt <= syncedUpdatedAtRef.current &&
      !snapshotsEqual(nextSnapshot, syncedSnapshot);

    if (isStaleExternalEntry) return;
    if (isSameEntry && isDirty) return;

    loadedEntryIdRef.current = entry.id;
    syncedUpdatedAtRef.current = entry.updatedAt;
    if (!snapshotsEqual(nextSnapshot, syncedSnapshot)) {
      setSyncedSnapshot(nextSnapshot);
    }
    setDeleteConfirming(false);
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
    showSaveStatus(null);
  }, [entry, isDirty, showSaveStatus, syncedSnapshot]);

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
      loadedEntryIdRef.current = record.id;
      syncedUpdatedAtRef.current = record.updatedAt;
      const nextSnapshot = snapshotFromEntry(record);
      if (!snapshotsEqual(nextSnapshot, syncedSnapshot)) {
        setSyncedSnapshot(nextSnapshot);
      }
      showSaveStatus(entry ? "已保存" : `已创建「${record.title}」`, 2400);
      void queryClient.invalidateQueries({ queryKey: ["world-entries", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["world-entry", record.id] });
    },
    onError: (err) => {
      showSaveStatus(`保存失败：${friendlyErrorMessage(err)}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!entry) throw new Error("no entry");
      return worldApi.delete({ id: entry.id });
    },
    onSuccess: (_data) => {
      setDeleteConfirming(false);
      if (entry) onDeleted(entry.id);
      void queryClient.invalidateQueries({ queryKey: ["world-entries", projectId] });
    },
    onError: (err) => {
      showSaveStatus(`删除失败：${friendlyErrorMessage(err)}`);
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
          <AnimatePresence initial={false}>
            {saveStatus ? (
              <motion.span
                key="world-entry-save-status"
                role="status"
                variants={fadeOnly}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {saveStatus}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {entry && (
            <AnimatePresence initial={false} mode="wait">
              {deleteConfirming ? (
                <motion.div
                  key="delete-confirm"
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => setDeleteConfirming(false)}
                    disabled={deleteMut.isPending}
                    className="rounded bg-ink-700 px-2 py-1 text-ink-200 hover:bg-ink-600 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate()}
                    disabled={deleteMut.isPending}
                    className="rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {deleteMut.isPending ? "删除中" : "确认删除"}
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="delete-start"
                  type="button"
                  onClick={() => setDeleteConfirming(true)}
                  disabled={deleteMut.isPending}
                  className="rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  删除
                </motion.button>
              )}
            </AnimatePresence>
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
            aria-label="条目标题"
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
                aria-label="自定义分类名"
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
            aria-label="条目别名"
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
            aria-label="条目标签"
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
            正文（可使用简单排版语法）
          </label>
          <textarea
            value={content}
            aria-label="条目正文"
            onChange={(e) => setContent(e.target.value)}
            placeholder="描述这一条目的设定、历史、与主线的关系…"
            className="min-h-[260px] w-full flex-1 resize-none rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm leading-6 text-ink-100"
          />
        </div>
      </div>
    </div>
  );
}
