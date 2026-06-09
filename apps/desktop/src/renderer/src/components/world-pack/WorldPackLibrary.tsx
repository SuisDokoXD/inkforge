// =============================================================================
// 卡牌库主视图（Library · UI 优化版）
// =============================================================================
// 优化点：
//   - sticky 顶栏 + backdrop-blur，滚动时浮在内容上
//   - 加载状态用骨架屏网格（不是单行 spinner）
//   - 空状态加大视觉 + 提供 quick-start CTA
//   - 融合模式 banner 用 ring + glow 强调
//   - "已插槽 N" 数字徽章在按钮上叠加
// =============================================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Search, Layers, X } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { worldPackApi } from "../../lib/api";
import type { WorldPackOrigin, WorldPackRecord } from "@inkforge/shared";
import { WorldPackCard, WorldPackCardSkeleton } from "./WorldPackCard";
import { WorldPackEditDialog } from "./WorldPackEditDialog";
import { FusionDialog } from "./FusionDialog";
import { PackSlotPanel } from "./PackSlotPanel";

type FilterOrigin = "all" | WorldPackOrigin;

const ORIGIN_FILTERS: Array<{ key: FilterOrigin; label: string; cls: string }> = [
  { key: "all", label: "全部", cls: "ring-ink-600/60" },
  { key: "user", label: "原创", cls: "ring-accent-400/60" },
  { key: "fused", label: "融合", cls: "ring-fuchsia-400/60" },
  { key: "imported", label: "导入", cls: "ring-sky-400/60" },
];

export function WorldPackLibrary(): JSX.Element {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<FilterOrigin>("all");
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [fusionMode, setFusionMode] = useState(false);
  const [fusionSourceIds, setFusionSourceIds] = useState<string[]>([]);
  const [showFusionDialog, setShowFusionDialog] = useState(false);
  const [showSlotPanel, setShowSlotPanel] = useState(false);

  const packsQuery = useQuery({
    queryKey: ["world-packs", search, originFilter],
    queryFn: () =>
      worldPackApi.list({
        search: search.trim() || undefined,
        origin: originFilter === "all" ? undefined : originFilter,
      }),
  });

  const slotsQuery = useQuery({
    queryKey: ["world-pack-slots", currentProjectId],
    queryFn: () =>
      currentProjectId
        ? worldPackApi.slotList({ projectId: currentProjectId })
        : Promise.resolve([]),
    enabled: !!currentProjectId,
  });
  const slottedIds = useMemo(
    () => new Set((slotsQuery.data ?? []).map((s) => s.packId)),
    [slotsQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      worldPackApi.create({
        name: `未命名卡牌 ${new Date().toLocaleDateString("zh-CN")}`,
        tagline: "",
        description: "",
        tags: [],
      }),
    onSuccess: (pack) => {
      queryClient.invalidateQueries({ queryKey: ["world-packs"] });
      setEditingPackId(pack.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (packId: string) => worldPackApi.delete({ id: packId }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["world-packs"] });
      queryClient.invalidateQueries({ queryKey: ["world-pack-slots"] });
      setFusionSourceIds((cur) => cur.filter((packId) => packId !== id));
      if (editingPackId === id) setEditingPackId(null);
    },
  });

  function handleCardClick(pack: WorldPackRecord): void {
    if (fusionMode) {
      setFusionSourceIds((cur) =>
        cur.includes(pack.id)
          ? cur.filter((x) => x !== pack.id)
          : cur.length < 4
            ? [...cur, pack.id]
            : cur,
      );
      return;
    }
    setEditingPackId(pack.id);
  }

  const slotMutation = useMutation({
    mutationFn: ({ packId }: { packId: string }) =>
      worldPackApi.slotAdd({ projectId: currentProjectId!, packId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["world-pack-slots"] });
    },
  });
  function handleCardDoubleClick(pack: WorldPackRecord): void {
    if (fusionMode || !currentProjectId) return;
    if (slottedIds.has(pack.id)) return;
    slotMutation.mutate({ packId: pack.id });
  }

  function handleCardDelete(pack: WorldPackRecord): void {
    if (deleteMutation.isPending) return;
    const slottedHint = slottedIds.has(pack.id)
      ? "此卡当前已插槽到项目，删除后会同时从插槽中移除。"
      : "此操作不可撤销。";
    if (!confirm(`删除卡牌「${pack.name}」？\n\n${slottedHint}`)) return;
    deleteMutation.mutate(pack.id);
  }

  const packs = packsQuery.data ?? [];
  const isLoading = packsQuery.isLoading;
  const isEmpty = !isLoading && packs.length === 0;

  return (
    <div className="relative flex h-full w-full flex-col bg-ink-900">
      {/* ===== Sticky 顶栏（搜索 + 来源切换 + 操作） ===== */}
      <div className="sticky top-0 z-20 flex flex-col gap-2 border-b border-ink-700/80 bg-ink-900/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索卡牌名 / 简介 / 标签"
              className="w-full rounded-lg border border-ink-700 bg-ink-800/70 py-1.5 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:bg-ink-800 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {currentProjectId && (
              <button
                onClick={() => setShowSlotPanel((v) => !v)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
                  showSlotPanel
                    ? "bg-accent-500 text-ink-900 shadow-lg shadow-accent-500/20"
                    : "border border-ink-700 bg-ink-800/60 text-ink-200 hover:border-accent-500/40 hover:bg-ink-800"
                }`}
                title="管理当前项目的卡牌插槽"
              >
                <Layers className="h-4 w-4" />
                <span>插槽</span>
                {slottedIds.size > 0 && (
                  <span
                    className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      showSlotPanel
                        ? "bg-ink-900 text-accent-300"
                        : "bg-accent-500 text-ink-900"
                    }`}
                  >
                    {slottedIds.size}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => {
                setFusionMode((v) => !v);
                setFusionSourceIds([]);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
                fusionMode
                  ? "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30"
                  : "border border-ink-700 bg-ink-800/60 text-ink-200 hover:border-fuchsia-400/40 hover:bg-ink-800"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              {fusionMode ? "取消融合" : "融合"}
            </button>
            {fusionMode && fusionSourceIds.length >= 2 && (
              <button
                onClick={() => setShowFusionDialog(true)}
                className="animate-pulse rounded-lg bg-fuchsia-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/40 hover:bg-fuchsia-400"
              >
                融合 {fusionSourceIds.length} 张 →
              </button>
            )}
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-900 shadow-lg shadow-accent-500/20 hover:bg-accent-400 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> 新建卡牌
            </button>
          </div>
        </div>

        {/* 来源筛选 chip 行 */}
        <div className="flex items-center gap-1.5">
          {ORIGIN_FILTERS.map((f) => {
            const active = originFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setOriginFilter(f.key)}
                className={`rounded-full px-3 py-0.5 text-xs ring-1 transition-all ${
                  active
                    ? `bg-ink-800 text-ink-100 ${f.cls} shadow-inner`
                    : "border border-ink-700/60 bg-transparent text-ink-400 hover:text-ink-200"
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-ink-500">
            {isLoading ? "加载中…" : `共 ${packs.length} 张卡`}
          </span>
        </div>
      </div>

      {/* ===== 融合模式横幅 ===== */}
      {fusionMode && (
        <div className="border-b border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-500/10 via-fuchsia-500/20 to-fuchsia-500/10 px-4 py-2 text-xs text-fuchsia-100 ring-1 ring-fuchsia-400/20">
          <span className="font-medium">融合模式</span>　点选 2-4 张源卡作为输入，LLM 会按你的 brief 生成一张新卡。已选{" "}
          <span className="rounded bg-fuchsia-500/30 px-1.5 py-0.5 font-bold">
            {fusionSourceIds.length} / 4
          </span>
        </div>
      )}

      {/* ===== 主体 ===== */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <WorldPackCardSkeleton key={i} />
              ))}
            </div>
          ) : isEmpty ? (
            <EmptyState onCreate={() => createMutation.mutate()} hasFilter={!!search || originFilter !== "all"} />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {packs.map((pack) => {
                const idx = fusionSourceIds.indexOf(pack.id);
                return (
                  <WorldPackCard
                    key={pack.id}
                    pack={pack}
                    selected={slottedIds.has(pack.id)}
                    selectionIndex={fusionMode && idx >= 0 ? idx : undefined}
                    onClick={handleCardClick}
                    onDoubleClick={handleCardDoubleClick}
                    onDelete={handleCardDelete}
                  />
                );
              })}
            </div>
          )}
        </div>
        {showSlotPanel && currentProjectId && (
          <aside className="w-[340px] shrink-0 border-l border-ink-700 bg-ink-900/80 backdrop-blur-sm">
            <PackSlotPanel
              projectId={currentProjectId}
              allPacks={packs}
              onClose={() => setShowSlotPanel(false)}
            />
          </aside>
        )}
      </div>

      {editingPackId && (
        <WorldPackEditDialog
          packId={editingPackId}
          onClose={() => setEditingPackId(null)}
        />
      )}
      {showFusionDialog && (
        <FusionDialog
          sourcePackIds={fusionSourceIds}
          onClose={() => setShowFusionDialog(false)}
          onFused={() => {
            setShowFusionDialog(false);
            setFusionMode(false);
            setFusionSourceIds([]);
            queryClient.invalidateQueries({ queryKey: ["world-packs"] });
          }}
        />
      )}
    </div>
  );
}

// ----- 空状态：分两种 -----
//   - 真的没卡 → 大图标 + 描述 + 主 CTA
//   - 筛选无果 → 提示用户调整搜索/过滤
function EmptyState({
  onCreate,
  hasFilter,
}: {
  onCreate(): void;
  hasFilter: boolean;
}): JSX.Element {
  if (hasFilter) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-400">
        <Search className="h-14 w-14 opacity-30" />
        <div className="text-base">没找到匹配的卡牌</div>
        <div className="text-xs text-ink-500">试试改一下搜索词或切换来源</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="relative">
        <Sparkles className="h-20 w-20 text-accent-500/30" />
        <Sparkles className="absolute left-2 top-2 h-12 w-12 text-fuchsia-500/30" />
      </div>
      <div className="text-center">
        <div className="text-lg font-medium text-ink-200">卡牌库空空如也</div>
        <p className="mt-1 max-w-md text-sm text-ink-400">
          世界观卡牌让你把完整的设定预设（修真 / 蒸朋 / 末日…）保存为可流通的"卡"。
          <br />
          需要时挑一张插槽到当前项目，或把多张融合成全新的卡。
        </p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2 text-sm font-medium text-ink-900 shadow-lg shadow-accent-500/20 hover:bg-accent-400"
      >
        <Plus className="h-4 w-4" /> 建第一张卡
      </button>
      <div className="mt-2 text-xs text-ink-500">
        提示：双击任意卡牌可快速插槽到当前项目
      </div>
    </div>
  );
}
