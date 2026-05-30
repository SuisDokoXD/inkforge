import { useEffect, useRef, useState } from "react";
import type { WorldEntryRecord } from "@inkforge/shared";
import { pickStableColor } from "../../lib/stable-color";

interface WorldEntryListProps {
  entries: WorldEntryRecord[];
  activeId: string | null;
  searchQuery: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  // —— 批量选择模式（可选）——
  // 提供这两个 props 后，行会显示 checkbox，单击行变为切换选中而非聚焦。
  // 不提供时退化为旧的单选行为，零破坏。
  multiSelectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
}

// 简易虚拟化阈值：少于这个数量时不启用，避免给小列表引入测量抖动。
// react-virtuoso 太重，未列入项目依赖；条目量级在 50-500 之间，自实现窗口化够用。
const VIRTUALIZE_THRESHOLD = 80;
// 单条预估高度（px）：title + alias + tags 三段在多数场景接近 72。
// 固定值会让滚动条与真实位置有微小偏差，但视觉上完全可接受，远比渲染 500 个 DOM 节点便宜。
const ITEM_HEIGHT = 72;
// 上下各多渲染几行，避免快速滚动时露出空白边缘。
const OVERSCAN = 6;

export function WorldEntryList({
  entries,
  activeId,
  searchQuery,
  onQueryChange,
  onSelect,
  onCreate,
  multiSelectMode = false,
  selectedIds,
  onToggleSelected,
}: WorldEntryListProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 监听容器滚动 + resize，驱动可见窗口计算
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const total = entries.length;
  const virtualize = total > VIRTUALIZE_THRESHOLD && viewportHeight > 0;
  // 计算可见区索引；非虚拟模式下全量
  const startIdx = virtualize
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
    : 0;
  const endIdx = virtualize
    ? Math.min(
        total,
        Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN,
      )
    : total;
  const visible = entries.slice(startIdx, endIdx);

  return (
    <div className="flex h-full flex-col border-l border-ink-700 bg-ink-800/30">
      <div className="flex items-center gap-2 border-b border-ink-700 p-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="🔍 搜索标题 / 别名 / 标签 / 正文"
          className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-accent-500/20 px-2 py-1 text-xs text-accent-300 hover:bg-accent-500/30"
          title="新建条目"
        >
          + 新建
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
        {total === 0 && (
          <div className="p-8 text-center text-xs text-ink-500">
            {searchQuery ? "未命中任何条目" : "当前分类暂无条目，点击「新建」开始。"}
          </div>
        )}
        {/* 虚拟化时撑出真实总高度，让原生滚动条位置正确 */}
        {virtualize && <div style={{ height: startIdx * ITEM_HEIGHT }} aria-hidden />}
        {visible.map((entry) => {
          const active = entry.id === activeId;
          const alias = entry.aliases.slice(0, 2).join("、");
          // 条目左侧色条：按类别稳定染色，帮助快速分群浏览
          const accent = pickStableColor(entry.category);
          const selected = !!selectedIds?.has(entry.id);
          const handleClick = (): void => {
            if (multiSelectMode) onToggleSelected?.(entry.id);
            else onSelect(entry.id);
          };
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleClick();
              }}
              className={`relative cursor-pointer border-b border-ink-700/50 px-3 py-2 pl-3.5 transition ${
                active && !multiSelectMode ? "bg-ink-700/60" : "hover:bg-ink-700/20"
              } ${multiSelectMode && selected ? "bg-accent-500/10" : ""}`}
            >
              <span
                aria-hidden
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                style={{ background: accent, opacity: active || selected ? 1 : 0.6 }}
              />
              <div className="flex items-center gap-2">
                {multiSelectMode && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelected?.(entry.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 shrink-0 accent-accent-500"
                  />
                )}
                <span className="truncate text-sm text-ink-100">{entry.title}</span>
                <span className="shrink-0 rounded-sm bg-ink-900/60 px-1.5 py-[1px] text-[10px] text-ink-400">
                  {entry.category}
                </span>
              </div>
              {alias && (
                <div className="mt-0.5 truncate text-[11px] text-ink-500">
                  别名：{alias}
                  {entry.aliases.length > 2 ? " …" : ""}
                </div>
              )}
              {entry.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-ink-700/40 px-1.5 py-[1px] text-[10px] text-ink-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* 虚拟化时下方撑高，保证 endIdx 之后还有足够滚动空间 */}
        {virtualize && (
          <div style={{ height: (total - endIdx) * ITEM_HEIGHT }} aria-hidden />
        )}
      </div>
    </div>
  );
}
