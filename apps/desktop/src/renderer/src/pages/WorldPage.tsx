import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { worldApi } from "../lib/api";
import { WorldCategorySidebar } from "../components/world/WorldCategorySidebar";
import { WorldEntryList } from "../components/world/WorldEntryList";
import { WorldEntryDetail } from "../components/world/WorldEntryDetail";
import { WorldGraph } from "../components/world/WorldGraph";
import { WorldCommandPalette } from "../components/world/WorldCommandPalette";
import { WorldPackLibrary } from "../components/world-pack/WorldPackLibrary";
import { WorldInfoDiagnosticPanel } from "../components/world-pack/WorldInfoDiagnosticPanel";
import { AuthorNotePanel } from "../components/AuthorNotePanel";
import { VoiceProfileDialog } from "../components/voice-profile/VoiceProfileDialog";

const DRAFT_ID = "__draft__";
type WorldTab = "entries" | "graph" | "packs" | "note" | "diag";

export function WorldPage(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const activeCategory = useAppStore((s) => s.activeWorldCategory);
  const setActiveCategory = useAppStore((s) => s.setActiveWorldCategory);
  const activeEntryId = useAppStore((s) => s.activeWorldEntryId);
  const setActiveEntryId = useAppStore((s) => s.setActiveWorldEntryId);
  const searchQuery = useAppStore((s) => s.worldSearchQuery);
  const setSearchQuery = useAppStore((s) => s.setWorldSearchQuery);
  const [tab, setTab] = useState<WorldTab>("entries");
  const [voiceProfileOpen, setVoiceProfileOpen] = useState(false);

  // —— 命令面板（Ctrl/Cmd+K）——
  const [paletteOpen, setPaletteOpen] = useState(false);

  // —— 批量选择模式 ——
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const queryClient = useQueryClient();

  const allEntriesQuery = useQuery({
    queryKey: ["world-entries", currentProjectId],
    queryFn: () =>
      currentProjectId
        ? worldApi.list({ projectId: currentProjectId })
        : Promise.resolve([]),
    enabled: !!currentProjectId,
  });

  const filteredEntries = useMemo(() => {
    const list = allEntriesQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();
    return list.filter((entry) => {
      if (activeCategory && entry.category !== activeCategory) return false;
      if (!query) return true;
      if (entry.title.toLowerCase().includes(query)) return true;
      if (entry.category.toLowerCase().includes(query)) return true;
      if (entry.aliases.some((a) => a.toLowerCase().includes(query))) return true;
      if (entry.tags.some((t) => t.toLowerCase().includes(query))) return true;
      if (entry.content.toLowerCase().includes(query)) return true;
      return false;
    });
  }, [allEntriesQuery.data, activeCategory, searchQuery]);

  const activeEntry = useMemo(() => {
    if (!activeEntryId || activeEntryId === DRAFT_ID) return null;
    return (
      (allEntriesQuery.data ?? []).find((entry) => entry.id === activeEntryId) ?? null
    );
  }, [allEntriesQuery.data, activeEntryId]);

  useEffect(() => {
    if (
      activeEntryId &&
      activeEntryId !== DRAFT_ID &&
      allEntriesQuery.data &&
      !allEntriesQuery.data.some((e) => e.id === activeEntryId)
    ) {
      setActiveEntryId(null);
    }
  }, [activeEntryId, allEntriesQuery.data, setActiveEntryId]);

  // 全局 Ctrl/Cmd+K：打开命令面板。仅在 entries 标签页响应，避免与其它面板争用。
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // —— 批量动作：删除（顺序调用 worldApi.delete）——
  // 失败的条目跳过、继续删剩余的，最后统一刷新列表。
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        try {
          await worldApi.delete({ id });
        } catch {
          // 单条失败不打断；最后 toast 由调用方处理
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-entries", currentProjectId] });
      setSelectedIds(new Set());
      setMultiSelectMode(false);
    },
  });

  // —— 批量动作：修改类别 ——
  const batchSetCategoryMutation = useMutation({
    mutationFn: async (input: { ids: string[]; category: string }) => {
      for (const id of input.ids) {
        try {
          await worldApi.update({ id, category: input.category });
        } catch {
          // ignore individual failures
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-entries", currentProjectId] });
      setSelectedIds(new Set());
    },
  });

  function toggleSelectedId(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBatchDelete(): void {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`确定批量删除 ${ids.length} 个条目？此操作不可撤销。`)) return;
    batchDeleteMutation.mutate(ids);
  }

  function handleBatchSetCategory(): void {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const category = window.prompt(`将选中的 ${ids.length} 个条目改为哪个类别？`);
    if (!category || !category.trim()) return;
    batchSetCategoryMutation.mutate({ ids: ids, category: category.trim() });
  }

  function exitMultiSelect(): void {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }

  if (!currentProjectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">🌍 世界观设定库</div>
          <p className="text-sm text-ink-300">
            请先在侧边栏选择或创建一个项目以管理设定条目。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-ink-900">
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-700 px-3 py-1.5 text-xs">
        <button
          className={`rounded-md px-3 py-1 ${tab === "entries" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("entries")}
        >
          条目
        </button>
        <button
          className={`rounded-md px-3 py-1 ${tab === "graph" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("graph")}
        >
          关系图
        </button>
        <button
          className={`rounded-md px-3 py-1 ${tab === "packs" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("packs")}
          title="跨项目卡牌库：保存好几套完整世界观，需要时挑一张或融合多张"
        >
          🃏 卡牌库
        </button>
        <button
          className={`rounded-md px-3 py-1 ${tab === "note" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("note")}
          title="全局风格批注：每次模型写作都会参考"
        >
          📌 作者批注
        </button>
        <button
          className={`rounded-md px-3 py-1 ${tab === "diag" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("diag")}
          title="查看模型写作时参考了哪些世界观资料"
        >
          参考记录
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-800"
            title="打开命令面板（Ctrl/Cmd+K）"
          >
            ⌘K
          </button>
          <button
            onClick={() => setVoiceProfileOpen(true)}
            className="rounded-md px-3 py-1 text-ink-300 hover:bg-ink-800"
            title="编辑写作声音档案（每次模型生成都会参考）"
          >
            🎙️ 写作声音
          </button>
        </div>
      </div>
      {tab === "entries" ? (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[220px] shrink-0">
            <WorldCategorySidebar
              entries={allEntriesQuery.data ?? []}
              activeCategory={activeCategory}
              onSelect={setActiveCategory}
            />
          </aside>
          <section className="flex w-[300px] shrink-0 flex-col">
            {/* 批量操作条：仅在批量模式下显示 */}
            {multiSelectMode && (
              <div className="flex items-center justify-between border-b border-accent-500/40 bg-accent-500/10 px-2 py-1.5 text-xs text-accent-200">
                <span>已选 {selectedIds.size} 项</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleBatchSetCategory}
                    disabled={selectedIds.size === 0 || batchSetCategoryMutation.isPending}
                    className="rounded bg-accent-500/20 px-2 py-0.5 hover:bg-accent-500/30 disabled:opacity-50"
                  >
                    改类别
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                    className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={exitMultiSelect}
                    className="rounded bg-ink-700 px-2 py-0.5 text-ink-200 hover:bg-ink-600"
                  >
                    退出
                  </button>
                </div>
              </div>
            )}
            <WorldEntryList
              entries={filteredEntries}
              activeId={activeEntryId}
              searchQuery={searchQuery}
              onQueryChange={setSearchQuery}
              onSelect={setActiveEntryId}
              onCreate={() => setActiveEntryId(DRAFT_ID)}
              multiSelectMode={multiSelectMode}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelectedId}
            />
          </section>
          <WorldEntryDetail
            projectId={currentProjectId}
            entry={activeEntry}
            onDeleted={() => setActiveEntryId(null)}
          />
        </div>
      ) : tab === "graph" ? (
        <div className="flex-1 overflow-hidden">
          <WorldGraph projectId={currentProjectId} />
        </div>
      ) : tab === "packs" ? (
        <div className="flex-1 overflow-hidden">
          <WorldPackLibrary />
        </div>
      ) : tab === "diag" ? (
        <div className="flex-1 overflow-hidden">
          <WorldInfoDiagnosticPanel projectId={currentProjectId} />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <AuthorNotePanel projectId={currentProjectId} />
        </div>
      )}
      {voiceProfileOpen && (
        <VoiceProfileDialog
          projectId={currentProjectId}
          onClose={() => setVoiceProfileOpen(false)}
        />
      )}
      <WorldCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        entries={allEntriesQuery.data ?? []}
        onSelectEntry={(id) => {
          setTab("entries");
          setActiveEntryId(id);
        }}
        onCreateEntry={() => {
          setTab("entries");
          setActiveEntryId(DRAFT_ID);
        }}
        onToggleMultiSelect={() => {
          setMultiSelectMode((v) => !v);
          if (multiSelectMode) setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
