// =============================================================================
// 单张卡牌的展示组件（UI 优化版）
// =============================================================================
// 视觉升级要点：
//   - 3D mouse-tilt（perspective + rotateX/Y），借鉴 Aceternity Tilt Card
//   - 鼠标跟随径向高光（SmoothUI Glow Cursor）
//   - fused 卡专属 holo sweep：斜向闪光带 hover 时滑过卡面
//   - 更柔和的暗色底蒙版（双层 gradient）+ 文字 drop-shadow 提升对比
//   - 提供 Skeleton 子组件供加载状态占位
//   - 不引入 framer-motion / 任何动画库；全部用 CSS transform + transition
// =============================================================================

import { useRef, useState } from "react";
import { usePackCover } from "../../hooks/usePackCover";
import { fallbackGradient } from "./visual-hash";
import type { WorldPackRecord } from "@inkforge/shared";

interface WorldPackCardProps {
  pack: WorldPackRecord;
  selected?: boolean;
  selectionIndex?: number;
  onClick?(pack: WorldPackRecord): void;
  onDoubleClick?(pack: WorldPackRecord): void;
}

// origin → 卡边色调：user=琥珀；fused=洋红；imported=天青
function originRing(origin: WorldPackRecord["origin"]): string {
  if (origin === "fused") return "ring-fuchsia-400/60";
  if (origin === "imported") return "ring-sky-400/60";
  return "ring-amber-400/50";
}

function originBadgeStyle(origin: WorldPackRecord["origin"]): {
  label: string;
  cls: string;
} {
  if (origin === "fused")
    return { label: "融合", cls: "bg-fuchsia-500/90 text-white" };
  if (origin === "imported")
    return { label: "导入", cls: "bg-sky-500/90 text-white" };
  return { label: "原创", cls: "bg-amber-500/90 text-ink-900" };
}

// 卡名 → 稳定渐变背景（缺封面时降级）—— 见 ./visual-hash

export function WorldPackCard({
  pack,
  selected,
  selectionIndex,
  onClick,
  onDoubleClick,
}: WorldPackCardProps): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovering, setHovering] = useState(false);
  const { dataUrl: coverUrl } = usePackCover(pack);

  // 鼠标位置 → 3D tilt + 径向高光定位
  function handleMove(e: React.MouseEvent<HTMLButtonElement>): void {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    el.style.setProperty("--x", `${localX}px`);
    el.style.setProperty("--y", `${localY}px`);
    // tilt 角度：以中心为原点，最大 ±7 度，足以有"实物"感又不过分
    const rx = ((localY / rect.height) - 0.5) * -10;
    const ry = ((localX / rect.width) - 0.5) * 10;
    el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
  }
  function handleLeave(): void {
    const el = ref.current;
    if (el) el.style.transform = "";
    setHovering(false);
  }

  const bg = coverUrl ? `url(${coverUrl})` : fallbackGradient(pack.name + pack.id);
  const badge = originBadgeStyle(pack.origin);
  const isFused = pack.origin === "fused";

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onClick?.(pack)}
      onDoubleClick={() => onDoubleClick?.(pack)}
      onMouseEnter={() => setHovering(true)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-xl
        border border-ink-700/80 bg-ink-800/60 text-left
        ring-1 ${originRing(pack.origin)}
        transition-[box-shadow,transform] duration-200 ease-out will-change-transform
        hover:shadow-2xl hover:shadow-amber-500/20
        ${selected ? "ring-2 ring-amber-400 shadow-xl shadow-amber-500/30" : ""}
      `}
      style={{
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transformStyle: "preserve-3d",
      }}
      title={pack.tagline || pack.name}
    >
      {/* 鼠标跟随径向高光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(260px circle at var(--x, 50%) var(--y, 50%), rgba(251,191,36,0.22), transparent 60%)",
        }}
      />
      {/* 双层蒙版：保证文字 + tag chip 在任何封面上都可读 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/95 via-ink-900/45 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-ink-900/40"
      />

      {/* fused 卡专属 holo sweep：hover 时一条斜向高光带横扫卡面 */}
      {isFused && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-br from-transparent via-fuchsia-200/30 to-transparent transition-transform duration-700 ease-out ${
            hovering ? "translate-x-full" : ""
          }`}
          style={{ mixBlendMode: "screen" }}
        />
      )}

      {/* 右上角徽章组 */}
      <span className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        {selectionIndex !== undefined && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-ink-900 shadow-lg ring-2 ring-ink-900">
            {selectionIndex + 1}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow ${badge.cls}`}
        >
          {badge.label}
        </span>
      </span>

      {/* 左上角：已插槽指示 */}
      {selected && selectionIndex === undefined && (
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-ink-900 shadow-lg">
          ✓ 已插槽
        </span>
      )}

      {/* 卡牌底部信息 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-3.5">
        <h3
          className="line-clamp-2 text-base font-semibold leading-tight text-ink-50"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          {pack.name}
        </h3>
        {pack.tagline && (
          <p
            className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-100/90"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            {pack.tagline}
          </p>
        )}
        {pack.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {pack.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-ink-900/60 px-2 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-400/40 backdrop-blur-sm"
              >
                {t}
              </span>
            ))}
            {pack.tags.length > 4 && (
              <span className="self-center text-[10px] text-ink-300">
                +{pack.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// 加载骨架屏：用于 packsQuery.isLoading 时填充网格，避免布局塌陷 + 显得空白
export function WorldPackCardSkeleton(): JSX.Element {
  return (
    <div
      aria-hidden
      className="aspect-[3/4] w-full animate-pulse rounded-xl border border-ink-700/60 bg-gradient-to-br from-ink-800 to-ink-900 ring-1 ring-ink-700/40"
    >
      <div className="flex h-full flex-col justify-end p-3.5">
        <div className="h-4 w-2/3 rounded bg-ink-700/60" />
        <div className="mt-2 h-3 w-1/2 rounded bg-ink-700/40" />
        <div className="mt-2.5 flex gap-1">
          <div className="h-4 w-10 rounded-full bg-ink-700/40" />
          <div className="h-4 w-8 rounded-full bg-ink-700/40" />
        </div>
      </div>
    </div>
  );
}
