// =============================================================================
// EntryListItem —— 条目列表的一行
// =============================================================================
// 中栏列表项：上下移箭头（hover 显示）+ 类目/标题点击切换 + 删除按钮。
// 把单行的样式状态机从主对话框抽出来，避免那 60+ 行嵌套破坏阅读。
// =============================================================================

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { WorldPackEntryRecord } from "@inkforge/shared";

interface Props {
  entry: WorldPackEntryRecord;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onDelete(): void;
}

export function EntryListItem({
  entry,
  active,
  isFirst,
  isLast,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props): JSX.Element {
  return (
    <div
      className={`group flex items-center gap-1 border-b border-ink-800/60 px-2 py-2 transition-colors ${
        active
          ? "bg-accent-500/10 ring-1 ring-inset ring-accent-500/30"
          : "hover:bg-ink-800/40"
      }`}
    >
      <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100">
        <button
          disabled={isFirst}
          onClick={onMoveUp}
          className="rounded p-0.5 text-ink-400 hover:text-accent-300 disabled:opacity-30"
          title="上移"
          aria-label="上移条目"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          disabled={isLast}
          onClick={onMoveDown}
          className="rounded p-0.5 text-ink-400 hover:text-accent-300 disabled:opacity-30"
          title="下移"
          aria-label="下移条目"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onSelect}
        className="flex-1 truncate text-left text-sm"
      >
        <span className="text-ink-500">[{entry.category}]</span>{" "}
        <span className={active ? "text-accent-100" : "text-ink-200"}>
          {entry.title}
        </span>
      </button>
      <button
        onClick={(ev) => {
          ev.stopPropagation();
          if (confirm(`删除条目"${entry.title}"？`)) onDelete();
        }}
        className="rounded p-1 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
        title="删除"
        aria-label={`删除条目「${entry.title}」`}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
