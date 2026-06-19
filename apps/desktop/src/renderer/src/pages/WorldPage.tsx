import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Command, Globe2, Mic, StickyNote } from "lucide-react";
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
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";

const DRAFT_ID = "__draft__";
type WorldTab = "entries" | "graph" | "packs" | "note" | "diag";
type BatchStatus = {
  kind: "success" | "error";
  text: string;
};

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
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [batchCategoryDraft, setBatchCategoryDraft] = useState("");
  const { status: batchStatus, showStatus: showBatchStatus } =
    useTimedStatus<BatchStatus>();
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
      let failed = 0;
      for (const id of ids) {
        try {
          await worldApi.delete({ id });
        } catch {
          failed += 1;
        }
      }
      return { total: ids.length, failed };
    },
    onMutate: () => showBatchStatus(null),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["world-entries", currentProjectId] });
      if (result.failed > 0) {
        showBatchStatus({
          kind: "error",
          text: `已尝试删除 ${result.total} 项，其中 ${result.failed} 项失败。列表已刷新，请检查剩余条目后重试。`,
        });
      } else {
        showBatchStatus({ kind: "success", text: `已删除 ${result.total} 项` }, 2200);
        setSelectedIds(new Set());
        setMultiSelectMode(false);
      }
      setConfirmBatchDelete(false);
      setCategoryEditorOpen(false);
      setBatchCategoryDraft("");
    },
    onError: (err) => {
      showBatchStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "批量删除失败，请稍后重试。"),
      });
    },
  });

  // —— 批量动作：修改类别 ——
  const batchSetCategoryMutation = useMutation({
    mutationFn: async (input: { ids: string[]; category: string }) => {
      let failed = 0;
      for (const id of input.ids) {
        try {
          await worldApi.update({ id, category: input.category });
        } catch {
          failed += 1;
        }
      }
      return { total: input.ids.length, failed, category: input.category };
    },
    onMutate: () => showBatchStatus(null),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["world-entries", currentProjectId] });
      if (result.failed > 0) {
        showBatchStatus({
          kind: "error",
          text: `已尝试修改 ${result.total} 项，其中 ${result.failed} 项失败。列表已刷新，请检查剩余条目后重试。`,
        });
      } else {
        showBatchStatus(
          { kind: "success", text: `已将 ${result.total} 项改为「${result.category}」` },
          2600,
        );
        setSelectedIds(new Set());
      }
      setCategoryEditorOpen(false);
      setBatchCategoryDraft("");
    },
    onError: (err) => {
      showBatchStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "批量修改类别失败，请稍后重试。"),
      });
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
    setConfirmBatchDelete(false);
    batchDeleteMutation.mutate(ids);
  }

  function handleBatchSetCategory(): void {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const category = batchCategoryDraft.trim();
    if (!category) return;
    batchSetCategoryMutation.mutate({ ids: ids, category });
  }

  function exitMultiSelect(): void {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);
    setCategoryEditorOpen(false);
    setBatchCategoryDraft("");
    showBatchStatus(null);
  }

  useEffect(() => {
    setConfirmBatchDelete(false);
  }, [selectedIds]);

  if (!currentProjectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-lg text-accent-300">
            <Globe2 aria-hidden className="h-5 w-5" />
            世界观设定库
          </div>
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
          <BookOpen aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          卡牌库
        </button>
        <button
          className={`rounded-md px-3 py-1 ${tab === "note" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-800"}`}
          onClick={() => setTab("note")}
          title="全局风格批注：每次模型写作都会参考"
        >
          <StickyNote aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          作者批注
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
            aria-label="打开命令面板"
          >
            <Command aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setVoiceProfileOpen(true)}
            className="rounded-md px-3 py-1 text-ink-300 hover:bg-ink-800"
            title="编辑写作声音档案（每次模型生成都会参考）"
          >
            <Mic aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            写作声音
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
              <div className="border-b border-accent-500/40 bg-accent-500/10 px-2 py-1.5 text-xs text-accent-200">
                <div className="flex items-center justify-between gap-2">
                  <span>已选 {selectedIds.size} 项</span>
                  <div className="flex gap-1">
                    <AnimatePresence initial={false} mode="wait">
                      {categoryEditorOpen ? (
                        <motion.div
                          key="category-editor"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="flex gap-1"
                        >
                          <input
                            aria-label="批量设置类别"
                            value={batchCategoryDraft}
                            onChange={(event) => setBatchCategoryDraft(event.target.value)}
                            placeholder="类别"
                            className="h-5 w-24 rounded border border-accent-500/30 bg-ink-950 px-1.5 text-ink-100 outline-none placeholder:text-ink-500"
                          />
                          <button
                            type="button"
                            onClick={handleBatchSetCategory}
                            disabled={
                              selectedIds.size === 0 ||
                              !batchCategoryDraft.trim() ||
                              batchSetCategoryMutation.isPending
                            }
                            className="rounded bg-accent-500/20 px-2 py-0.5 hover:bg-accent-500/30 disabled:opacity-50"
                          >
                            {batchSetCategoryMutation.isPending ? "保存中" : "保存"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryEditorOpen(false);
                              setBatchCategoryDraft("");
                            }}
                            disabled={batchSetCategoryMutation.isPending}
                            className="rounded bg-ink-700 px-2 py-0.5 text-ink-200 hover:bg-ink-600 disabled:opacity-50"
                          >
                            取消
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="category-start"
                          type="button"
                          onClick={() => {
                            setConfirmBatchDelete(false);
                            setCategoryEditorOpen(true);
                          }}
                          disabled={selectedIds.size === 0 || batchSetCategoryMutation.isPending}
                          className="rounded bg-accent-500/20 px-2 py-0.5 hover:bg-accent-500/30 disabled:opacity-50"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          改类别
                        </motion.button>
                      )}
                    </AnimatePresence>
                    <AnimatePresence initial={false} mode="wait">
                      {confirmBatchDelete ? (
                        <motion.div
                          key="batch-delete-confirm"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="flex gap-1"
                        >
                          <button
                            type="button"
                            onClick={() => setConfirmBatchDelete(false)}
                            disabled={batchDeleteMutation.isPending}
                            className="rounded bg-ink-700 px-2 py-0.5 text-ink-200 hover:bg-ink-600 disabled:opacity-50"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={handleBatchDelete}
                            disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                            className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-100 hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            {batchDeleteMutation.isPending ? "删除中" : `确认删除 ${selectedIds.size} 项`}
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="batch-delete-start"
                          type="button"
                          onClick={() => {
                            setCategoryEditorOpen(false);
                            setBatchCategoryDraft("");
                            setConfirmBatchDelete(true);
                          }}
                          disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                          className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                          variants={fadeOnly}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          删除
                        </motion.button>
                      )}
                    </AnimatePresence>
                    <button
                      type="button"
                      onClick={exitMultiSelect}
                      className="rounded bg-ink-700 px-2 py-0.5 text-ink-200 hover:bg-ink-600"
                    >
                      退出
                    </button>
                  </div>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {batchStatus ? (
                <motion.div
                  key={batchStatus.text}
                  role={batchStatus.kind === "error" ? "alert" : "status"}
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={`border-b px-2 py-1.5 text-[11px] ${
                    batchStatus.kind === "error"
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {batchStatus.text}
                </motion.div>
              ) : null}
            </AnimatePresence>
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
      <VoiceProfileDialog
        open={voiceProfileOpen}
        projectId={currentProjectId}
        onClose={() => setVoiceProfileOpen(false)}
      />
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
