// =============================================================================
// 世界观命令面板（轻量级 cmdk 替代）
// =============================================================================
// 目的：给 World 页加一个 Ctrl/Cmd+K 全局快捷键，弹出可搜索的"跳转 + 命令"
// 面板。不引入 cmdk 第三方库，自写最小版以避免额外依赖。
//
// 支持两类候选：
//   1. 条目跳转：按标题 / 别名 / 标签模糊匹配，回车选中即聚焦该条目
//   2. 命令：固定行为（新建条目、切换分类视图、批量模式...）
//
// 键盘控制：
//   - ArrowUp / ArrowDown 切换高亮
//   - Enter 触发
//   - Esc 关闭
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorldEntryRecord } from "@inkforge/shared";
import { pickStableColor } from "../../lib/stable-color";

interface CommandItem {
  id: string;
  // 用于显示
  label: string;
  description?: string;
  // 命令 vs 条目；条目跳转时面板 onSelectEntry 回调
  kind: "command" | "entry";
  // 命令类别色（左侧色条）
  color?: string;
  // entry kind 时携带的实体引用
  entry?: WorldEntryRecord;
  // 命令 kind 时携带的动作 id
  action?: string;
}

export interface WorldCommandPaletteProps {
  open: boolean;
  onClose(): void;
  entries: WorldEntryRecord[];
  onSelectEntry(id: string): void;
  onCreateEntry(): void;
  onToggleMultiSelect(): void;
}

const COMMAND_DEFS: { id: string; label: string; description: string; color: string }[] = [
  {
    id: "create-entry",
    label: "新建条目",
    description: "在当前分类下创建一个新的世界观条目",
    color: "#34d399",
  },
  {
    id: "toggle-multi",
    label: "切换批量选择模式",
    description: "进入/退出批量操作模式以一次性删除或改类别",
    color: "#a78bfa",
  },
];

export function WorldCommandPalette({
  open,
  onClose,
  entries,
  onSelectEntry,
  onCreateEntry,
  onToggleMultiSelect,
}: WorldCommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 每次打开重置：清空搜索、聚焦输入、回到第一项
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // 等 DOM mount 后聚焦
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 合并候选：先列命中的条目（限 20），再列固定命令
  const items: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedEntries: CommandItem[] = [];
    if (q.length > 0) {
      for (const entry of entries) {
        if (matchedEntries.length >= 20) break;
        const hay =
          entry.title.toLowerCase() +
          " " +
          entry.aliases.join(" ").toLowerCase() +
          " " +
          entry.tags.join(" ").toLowerCase();
        if (hay.includes(q)) {
          matchedEntries.push({
            id: `entry:${entry.id}`,
            label: entry.title,
            description: `${entry.category}${entry.aliases.length > 0 ? "·" + entry.aliases.slice(0, 2).join("、") : ""}`,
            kind: "entry",
            entry,
            color: pickStableColor(entry.category),
          });
        }
      }
    }
    const commands: CommandItem[] = COMMAND_DEFS.map((c) => ({
      id: `cmd:${c.id}`,
      label: c.label,
      description: c.description,
      kind: "command",
      action: c.id,
      color: c.color,
    }));
    return [...matchedEntries, ...commands];
  }, [query, entries]);

  // 触发选中项
  function trigger(item: CommandItem): void {
    if (item.kind === "entry" && item.entry) {
      onSelectEntry(item.entry.id);
      onClose();
      return;
    }
    if (item.kind === "command") {
      if (item.action === "create-entry") onCreateEntry();
      else if (item.action === "toggle-multi") onToggleMultiSelect();
      onClose();
    }
  }

  // 全键盘控制
  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((idx) => Math.min(items.length - 1, idx + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((idx) => Math.max(0, idx - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) trigger(item);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-ink-700 p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="🔍 搜索条目，或输入命令..."
            className="w-full rounded bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {items.length === 0 ? (
            <li className="p-6 text-center text-xs text-ink-500">无候选</li>
          ) : (
            items.map((item, idx) => {
              const active = idx === activeIdx;
              return (
                <li
                  key={item.id}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => trigger(item)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                    active ? "bg-ink-700/60" : "hover:bg-ink-800"
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: item.color ?? "transparent" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink-100">{item.label}</div>
                    {item.description && (
                      <div className="truncate text-[11px] text-ink-500">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-ink-800 px-1.5 py-[1px] text-[10px] text-ink-400">
                    {item.kind === "entry" ? "条目" : "命令"}
                  </span>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-ink-700 bg-ink-950/40 px-3 py-1.5 text-[10px] text-ink-500">
          ↑↓ 选择 · ⏎ 确认 · ⎋ 关闭
        </div>
      </div>
    </div>
  );
}
