// =============================================================================
// 当前项目的卡牌插槽面板（UI 优化版）
// =============================================================================
// 优化点：
//   - 每个插槽显示卡封面缩略图（cover dataURL 异步读取）
//   - 紧凑卡片化布局：缩略图 + 卡名 + 副标
//   - 启用/禁用整行视觉切换（禁用半透明 + 灰阶）
//   - 拖拽手柄做了视觉提示（上下移箭头始终可见，不再 hover 显示）
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, X, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { worldPackApi } from "../../lib/api";
import { usePackCover } from "../../hooks/usePackCover";
import { fallbackGradientCompact } from "./visual-hash";
import type { WorldPackRecord } from "@inkforge/shared";

interface Props {
  projectId: string;
  allPacks: WorldPackRecord[];
  onClose(): void;
}

export function PackSlotPanel({ projectId, allPacks, onClose }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const slotsQuery = useQuery({
    queryKey: ["world-pack-slots", projectId],
    queryFn: () => worldPackApi.slotList({ projectId }),
  });
  const packMap = new Map(allPacks.map((p) => [p.id, p]));

  const invalidateSlots = () =>
    queryClient.invalidateQueries({ queryKey: ["world-pack-slots", projectId] });

  const removeMutation = useMutation({
    mutationFn: (packId: string) => worldPackApi.slotRemove({ projectId, packId }),
    onSuccess: invalidateSlots,
  });
  const toggleMutation = useMutation({
    mutationFn: ({ packId, enabled }: { packId: string; enabled: boolean }) =>
      worldPackApi.slotToggle({ projectId, packId, enabled }),
    onSuccess: invalidateSlots,
  });
  const reorderMutation = useMutation({
    mutationFn: (orderedPackIds: string[]) =>
      worldPackApi.slotReorder({ projectId, orderedPackIds }),
    onSuccess: invalidateSlots,
  });

  const slots = (slotsQuery.data ?? [])
    .slice()
    .sort((a, b) => a.slotOrder - b.slotOrder);

  function move(idx: number, delta: number): void {
    const next = slots.slice();
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorderMutation.mutate(next.map((s) => s.packId));
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部 */}
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-ink-100">
            已插槽 <span className="text-amber-300">{slots.length}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          title="收起"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 说明 */}
      <div className="border-b border-ink-700/40 bg-ink-900/30 px-3 py-1.5 text-[11px] text-ink-500">
        靠前的卡牌优先级更高；禁用的卡保留槽位但不参与注入
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {slots.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-500">
            <Layers className="mx-auto mb-3 h-10 w-10 opacity-20" />
            <div>还没插任何卡牌</div>
            <div className="mt-1 text-xs text-ink-600">
              双击库里的卡牌可快速插槽
            </div>
          </div>
        ) : (
          <div className="p-2">
            {slots.map((slot, idx) => {
              const pack = packMap.get(slot.packId);
              return (
                <SlotRow
                  key={slot.packId}
                  pack={pack}
                  packId={slot.packId}
                  enabled={slot.enabled}
                  isFirst={idx === 0}
                  isLast={idx === slots.length - 1}
                  onMoveUp={() => move(idx, -1)}
                  onMoveDown={() => move(idx, +1)}
                  onToggle={() =>
                    toggleMutation.mutate({
                      packId: slot.packId,
                      enabled: !slot.enabled,
                    })
                  }
                  onRemove={() => removeMutation.mutate(slot.packId)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface SlotRowProps {
  pack: WorldPackRecord | undefined;
  packId: string;
  enabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp(): void;
  onMoveDown(): void;
  onToggle(): void;
  onRemove(): void;
}

// 单个插槽行：缩略图 + 卡信息 + 控件
function SlotRow({
  pack,
  packId,
  enabled,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggle,
  onRemove,
}: SlotRowProps): JSX.Element {
  const { dataUrl: cover } = usePackCover(pack);

  return (
    <div
      className={`mb-2 flex items-center gap-2 rounded-lg border border-ink-700/60 bg-ink-800/40 p-2 transition-all ${
        enabled
          ? "hover:border-amber-500/30"
          : "opacity-50 grayscale hover:opacity-70"
      }`}
    >
      {/* 上下移列 */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-ink-500 transition-colors hover:bg-ink-700 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent"
          title="上移（优先级 +）"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-ink-500 transition-colors hover:bg-ink-700 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent"
          title="下移"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* 封面缩略图 */}
      <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-ink-700">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: pack
                ? fallbackGradientCompact(pack.id)
                : "linear-gradient(135deg, #374151, #1f2937)",
            }}
          />
        )}
      </div>

      {/* 卡信息 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-100">
          {pack?.name ?? `(已删除卡牌 ${packId.slice(0, 8)})`}
        </div>
        {pack?.tagline && (
          <div className="truncate text-[11px] text-ink-400">{pack.tagline}</div>
        )}
      </div>

      {/* 控件 */}
      <button
        onClick={onToggle}
        className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-amber-300"
        title={enabled ? "禁用此卡（保留槽位）" : "启用此卡"}
      >
        {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <button
        onClick={onRemove}
        className="rounded p-1 text-ink-400 hover:bg-red-500/20 hover:text-red-300"
        title="移除插槽"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
