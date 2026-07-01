// A7: 编辑器多标签栏——在 WorkspacePage 编辑器区顶部显示打开章节的标签页。
// 支持切换、关闭、分屏按钮。
import { useMemo } from "react";
import type { ChapterRecord } from "@inkforge/shared";
import { Columns2, Columns3, X } from "lucide-react";
import { useAppStore, type SplitMode } from "../../stores/app-store";

interface EditorTabBarProps {
  chapters: ChapterRecord[];
  focusMode: boolean;
}

export function EditorTabBar({ chapters, focusMode }: EditorTabBarProps): JSX.Element | null {
  const openEditorTabs = useAppStore((s) => s.openEditorTabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const splitMode = useAppStore((s) => s.splitMode);
  const setActiveTabIndex = useAppStore((s) => s.setActiveTabIndex);
  const closeTab = useAppStore((s) => s.closeTab);
  const setSplitMode = useAppStore((s) => s.setSplitMode);

  const chapterById = useMemo(() => {
    const m = new Map<string, ChapterRecord>();
    for (const ch of chapters) m.set(ch.id, ch);
    return m;
  }, [chapters]);

  if (openEditorTabs.length <= 1 && !splitMode) return null;

  const toggleSplit = () => {
    if (!splitMode) setSplitMode("2col");
    else if (splitMode === "2col") setSplitMode("3col");
    else setSplitMode(null);
  };

  return (
    <div
      className={`flex items-center border-b border-ink-700 bg-ink-800/50 ${
        focusMode ? "opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300" : ""
      }`}
      role="tablist"
      aria-label="编辑器标签页"
    >
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-thin">
        {openEditorTabs.map((chId, i) => {
          const ch = chapterById.get(chId);
          const active = i === activeTabIndex;
          return (
            <button
              key={chId}
              role="tab"
              aria-selected={active}
              aria-label={ch?.title ?? "章节"}
              className={`group flex shrink-0 items-center gap-1 border-r border-ink-700 px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-ink-900 text-accent-200 border-b-2 border-b-accent-500"
                  : "text-ink-400 hover:bg-ink-700/40 hover:text-ink-200"
              }`}
              onClick={() => setActiveTabIndex(i)}
              title={ch?.title ?? ""}
            >
              <span className="max-w-32 truncate">{ch?.title ?? "加载中…"}</span>
              {openEditorTabs.length > 1 ? (
                <span
                  className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(i);
                  }}
                  role="button"
                  aria-label={`关闭 ${ch?.title ?? "标签"}`}
                >
                  <X className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 分屏按钮 */}
      {openEditorTabs.length >= 2 ? (
        <button
          className={`shrink-0 border-l border-ink-700 px-2 py-1.5 text-xs transition-colors ${
            splitMode ? "bg-accent-500/15 text-accent-200" : "text-ink-400 hover:bg-ink-700/40 hover:text-ink-200"
          }`}
          onClick={toggleSplit}
          title={splitMode === "3col" ? "取消分屏" : splitMode === "2col" ? "三栏分屏" : "两栏分屏"}
          aria-pressed={!!splitMode}
        >
          {splitMode === "3col" ? (
            <Columns3 className="h-3.5 w-3.5" />
          ) : (
            <Columns2 className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}
