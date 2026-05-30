// =============================================================================
// 卡牌详情 / 编辑对话框（薄编排版）
// =============================================================================
// 拆完小件后，本文件只剩：
//   - 数据加载（pack + entries）
//   - mutation 状态与 invalidate
//   - 三栏布局编排（左 元数据/封面 · 中 条目列表 · 右 条目编辑）
// 具体子件见：
//   - ./dialog-parts/DialogShell       —— 外壳 + FieldLabel
//   - ./dialog-parts/CoverDropZone     —— 封面拖拽 / 上传
//   - ./dialog-parts/EntryListItem     —— 中栏行
//   - ./dialog-parts/EntryEditor       —— 右栏表单
// =============================================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { worldPackApi } from "../../lib/api";
import { usePackCover } from "../../hooks/usePackCover";
import { DialogShell, FieldLabel, type DialogSaveState } from "./dialog-parts/DialogShell";
import { CoverDropZone } from "./dialog-parts/CoverDropZone";
import { EntryListItem } from "./dialog-parts/EntryListItem";
import { EntryEditor } from "./dialog-parts/EntryEditor";

interface Props {
  packId: string;
  onClose(): void;
}

// MIME → 扩展名：写盘时需要落带扩展名的文件
const COVER_EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function WorldPackEditDialog({ packId, onClose }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<DialogSaveState>("idle");

  const packQuery = useQuery({
    queryKey: ["world-pack", packId],
    queryFn: () => worldPackApi.get({ id: packId }),
  });
  const entriesQuery = useQuery({
    queryKey: ["world-pack-entries", packId],
    queryFn: () => worldPackApi.entryList({ packId }),
  });
  const { dataUrl: coverPreview } = usePackCover(packQuery.data);

  // 统一的"保存中→已保存→淡出"状态机
  function withSaveIndicator<T extends (...args: any[]) => Promise<unknown>>(fn: T): T {
    return (async (...args: Parameters<T>) => {
      setSaveState("saving");
      try {
        const r = await fn(...args);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1200);
        return r;
      } catch (e) {
        setSaveState("idle");
        throw e;
      }
    }) as T;
  }

  const updateMutation = useMutation({
    mutationFn: withSaveIndicator((input: Parameters<typeof worldPackApi.update>[0]) =>
      worldPackApi.update(input),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-pack", packId] });
      queryClient.invalidateQueries({ queryKey: ["world-packs"] });
    },
  });

  const entryCreateMutation = useMutation({
    mutationFn: () =>
      worldPackApi.entryCreate({
        packId,
        category: "其他",
        title: `新条目 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
        content: "",
      }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["world-pack-entries", packId] });
      setActiveEntryId(entry.id);
    },
  });
  const entryUpdateMutation = useMutation({
    mutationFn: withSaveIndicator(
      (input: Parameters<typeof worldPackApi.entryUpdate>[0]) =>
        worldPackApi.entryUpdate(input),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-pack-entries", packId] });
    },
  });
  const entryDeleteMutation = useMutation({
    mutationFn: (id: string) => worldPackApi.entryDelete({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-pack-entries", packId] });
      setActiveEntryId(null);
    },
  });

  const coverUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ext = COVER_EXT_FROM_MIME[file.type] ?? "png";
      const buf = await file.arrayBuffer();
      return worldPackApi.coverWrite({
        packId,
        ext,
        bytes: buf,
        mime: file.type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-pack", packId] });
      queryClient.invalidateQueries({ queryKey: ["world-packs"] });
      queryClient.invalidateQueries({ queryKey: ["world-pack-cover"] });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    },
  });

  const pack = packQuery.data;
  const entries = entriesQuery.data ?? [];
  const activeEntry = entries.find((e) => e.id === activeEntryId) ?? null;

  // 类目自动补全候选：当前所有 entries 的去重 category
  const categoryOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.category).filter(Boolean))).sort(),
    [entries],
  );

  if (!pack) {
    return (
      <DialogShell onClose={onClose} title="加载中…">
        <div className="flex h-full items-center justify-center text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell
      onClose={onClose}
      title={pack.name}
      saveState={saveState}
      subtitle={`v${pack.version} · ${entries.length} 条目 · ${pack.origin === "fused" ? "融合卡" : pack.origin === "imported" ? "导入卡" : "原创卡"}`}
    >
      <div className="flex h-full w-full overflow-hidden">
        {/* ----- 左：元数据 + 封面 ----- */}
        <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-ink-700 bg-ink-900/40 p-4">
          <CoverDropZone
            coverUrl={coverPreview}
            uploading={coverUploadMutation.isPending}
            onPickFile={(f) => coverUploadMutation.mutate(f)}
          />

          <FieldLabel>卡牌名</FieldLabel>
          <input
            key={`name-${pack.id}-${pack.version}`}
            defaultValue={pack.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== pack.name) updateMutation.mutate({ id: pack.id, name: v });
            }}
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />

          <FieldLabel>副标题</FieldLabel>
          <input
            key={`tagline-${pack.id}-${pack.version}`}
            defaultValue={pack.tagline}
            onBlur={(e) =>
              e.target.value !== pack.tagline &&
              updateMutation.mutate({ id: pack.id, tagline: e.target.value })
            }
            placeholder="一句话副标（卡面用）"
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:outline-none"
          />

          <FieldLabel>长描述</FieldLabel>
          <textarea
            key={`desc-${pack.id}-${pack.version}`}
            defaultValue={pack.description}
            rows={4}
            onBlur={(e) =>
              e.target.value !== pack.description &&
              updateMutation.mutate({ id: pack.id, description: e.target.value })
            }
            placeholder="详细介绍这套世界观"
            className="resize-none rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:outline-none"
          />

          <FieldLabel>标签（逗号分隔）</FieldLabel>
          <input
            key={`tags-${pack.id}-${pack.version}`}
            defaultValue={pack.tags.join(", ")}
            onBlur={(e) => {
              const next = e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
              if (next.join(",") !== pack.tags.join(","))
                updateMutation.mutate({ id: pack.id, tags: next });
            }}
            placeholder="修真, 高武, 冷峻..."
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:outline-none"
          />

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>扫描深度</FieldLabel>
              <input
                key={`sd-${pack.id}-${pack.version}`}
                type="number"
                defaultValue={pack.scanDepth}
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(20, Number(e.target.value) || 3));
                  if (v !== pack.scanDepth)
                    updateMutation.mutate({ id: pack.id, scanDepth: v });
                }}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-sm text-ink-100"
              />
            </div>
            <div>
              <FieldLabel>Token 预算</FieldLabel>
              <input
                key={`tb-${pack.id}-${pack.version}`}
                type="number"
                defaultValue={pack.tokenBudget}
                onBlur={(e) => {
                  const v = Math.max(100, Number(e.target.value) || 1500);
                  if (v !== pack.tokenBudget)
                    updateMutation.mutate({ id: pack.id, tokenBudget: v });
                }}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-sm text-ink-100"
              />
            </div>
          </div>

          {pack.parentPackIds.length > 0 && (
            <div className="mt-1 rounded-md bg-fuchsia-500/10 p-2 text-xs text-fuchsia-200 ring-1 ring-fuchsia-400/30">
              融合自 {pack.parentPackIds.length} 张源卡
            </div>
          )}
        </aside>

        {/* ----- 中：条目列表 ----- */}
        <section className="flex w-[300px] shrink-0 flex-col border-r border-ink-700 bg-ink-900/20">
          <div className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900/40 px-3 py-2">
            <span className="text-sm font-medium text-ink-200">
              条目（{entries.length}）
            </span>
            <button
              onClick={() => entryCreateMutation.mutate()}
              className="flex items-center gap-1 rounded-md bg-accent-500 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400"
            >
              <Plus className="h-3 w-3" /> 新条目
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-500">
                <div className="mb-2 text-2xl opacity-40">📖</div>
                还没有条目
                <br />
                点上方"新条目"添加
              </div>
            ) : (
              entries.map((e, idx) => (
                <EntryListItem
                  key={e.id}
                  entry={e}
                  active={e.id === activeEntryId}
                  isFirst={idx === 0}
                  isLast={idx === entries.length - 1}
                  onSelect={() => setActiveEntryId(e.id)}
                  onMoveUp={() =>
                    entryUpdateMutation.mutate({
                      id: e.id,
                      order: (entries[idx - 1]?.order ?? 0) - 1,
                    })
                  }
                  onMoveDown={() =>
                    entryUpdateMutation.mutate({
                      id: e.id,
                      order: (entries[idx + 1]?.order ?? 0) + 1,
                    })
                  }
                  onDelete={() => entryDeleteMutation.mutate(e.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* ----- 右：条目编辑 ----- */}
        <section className="flex flex-1 flex-col overflow-y-auto">
          {activeEntry ? (
            <EntryEditor
              key={activeEntry.id}
              entry={activeEntry}
              categoryOptions={categoryOptions}
              onUpdate={(patch) =>
                entryUpdateMutation.mutate({ id: activeEntry.id, ...patch })
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-500">
              <div className="text-center">
                <div className="mb-3 text-4xl opacity-30">←</div>
                从左侧选一个条目，或新建一个
              </div>
            </div>
          )}
        </section>
      </div>
    </DialogShell>
  );
}
