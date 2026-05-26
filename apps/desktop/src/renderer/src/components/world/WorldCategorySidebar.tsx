import { useMemo } from "react";
import type { WorldEntryRecord } from "@inkforge/shared";
import { pickStableColor } from "../../lib/stable-color";

const DEFAULT_CATEGORIES = ["地点", "门派", "物件", "事件", "概念"];

interface CategorySidebarProps {
  entries: WorldEntryRecord[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

export function WorldCategorySidebar({
  entries,
  activeCategory,
  onSelect,
}: CategorySidebarProps): JSX.Element {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const custom = useMemo(() => {
    const list: string[] = [];
    for (const key of counts.keys()) {
      if (!DEFAULT_CATEGORIES.includes(key)) list.push(key);
    }
    list.sort();
    return list;
  }, [counts]);

  // 给类别左侧加一颗稳定染色的小圆点，便于一眼区分。
  // 传 null 时（"全部"）不染色，用透明占位保持对齐。
  const renderItem = (label: string, value: string | null, count: number) => {
    const active =
      (value === null && activeCategory === null) ||
      (value !== null && value === activeCategory);
    const dotColor = value ? pickStableColor(value) : "transparent";
    return (
      <button
        key={label}
        type="button"
        onClick={() => onSelect(value)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
          active
            ? "bg-amber-500/20 text-amber-200"
            : "text-ink-300 hover:bg-ink-700/40"
        }`}
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs text-ink-500">{count}</span>
      </button>
    );
  };

  const total = entries.length;

  return (
    <div className="flex h-full flex-col bg-ink-800/40">
      <div className="border-b border-ink-700 px-3 py-2 text-sm font-medium text-amber-300">
        世界观分类
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-2">
        {renderItem("全部", null, total)}
        <div className="my-2 border-t border-ink-700/60" />
        {DEFAULT_CATEGORIES.map((category) =>
          renderItem(category, category, counts.get(category) ?? 0),
        )}
        {custom.length > 0 && (
          <>
            <div className="my-2 border-t border-ink-700/60" />
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-ink-500">
              自定义
            </div>
            {custom.map((category) =>
              renderItem(category, category, counts.get(category) ?? 0),
            )}
          </>
        )}
      </div>
    </div>
  );
}
