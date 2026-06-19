import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChapterRecord } from "@inkforge/shared";
import { ArrowDown, ArrowUp, Plus, Search, Upload } from "lucide-react";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";
import { Button } from "./ui";

export interface ChapterHeadingItem {
  id: string;
  title: string;
  line: number;
}

interface ChapterTreeProps {
  chapters: ChapterRecord[];
  chapterHeadings?: Record<string, ChapterHeadingItem[]>;
  currentChapterId: string | null;
  activeHeadingId?: string | null;
  onSelect: (chapterId: string) => void;
  onSelectHeading?: (chapterId: string, heading: ChapterHeadingItem) => void;
  onCreate: () => void;
  onRename: (chapterId: string, title: string) => void;
  onDelete: (chapterId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onImportMd: () => void;
  creating: boolean;
  importing: boolean;
}

interface MenuState {
  chapterId: string;
  x: number;
  y: number;
}

function buildTree(chapters: ChapterRecord[]): ChapterRecord[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const byId = new Map<string, ChapterRecord[]>();
  const roots: ChapterRecord[] = [];
  for (const c of sorted) {
    if (c.parentId) {
      const arr = byId.get(c.parentId) ?? [];
      arr.push(c);
      byId.set(c.parentId, arr);
    } else {
      roots.push(c);
    }
  }
  const result: ChapterRecord[] = [];
  const walk = (node: ChapterRecord, depth: number): void => {
    result.push({ ...node, order: depth });
    const children = byId.get(node.id) ?? [];
    for (const child of children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return result;
}

type TreeRow =
  | { kind: "chapter"; chapter: ChapterRecord; depth: number }
  | { kind: "heading"; id: string; chapter: ChapterRecord; heading: ChapterHeadingItem; depth: number };

function buildRows(
  chapters: ChapterRecord[],
  chapterHeadings: Record<string, ChapterHeadingItem[]>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const byId = new Map<string, ChapterRecord[]>();
  const roots: ChapterRecord[] = [];
  for (const c of sorted) {
    if (c.parentId) {
      const arr = byId.get(c.parentId) ?? [];
      arr.push(c);
      byId.set(c.parentId, arr);
    } else {
      roots.push(c);
    }
  }
  const walk = (node: ChapterRecord, depth: number): void => {
    rows.push({ kind: "chapter", chapter: node, depth });
    for (const heading of chapterHeadings[node.id] ?? []) {
      rows.push({
        kind: "heading",
        id: heading.id,
        chapter: node,
        heading,
        depth: depth + 1,
      });
    }
    for (const child of byId.get(node.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return rows;
}

export function ChapterTree({
  chapters,
  chapterHeadings = {},
  currentChapterId,
  activeHeadingId = null,
  onSelect,
  onSelectHeading,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onImportMd,
  creating,
  importing,
}: ChapterTreeProps): JSX.Element {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const flatAll = useMemo(() => buildTree(chapters), [chapters]);
  const rowAll = useMemo(() => buildRows(chapters, chapterHeadings), [chapters, chapterHeadings]);
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!normalizedQuery) return rowAll;
    return rowAll.filter((row) =>
      row.kind === "chapter"
        ? row.chapter.title.toLowerCase().includes(normalizedQuery)
        : row.heading.title.toLowerCase().includes(normalizedQuery) ||
          row.chapter.title.toLowerCase().includes(normalizedQuery),
    );
  }, [rowAll, normalizedQuery]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
        setDeleteConfirmId(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const orderedIds = useMemo(() => flatAll.map((c) => c.id), [flatAll]);
  const menuChapter = menu ? chapters.find((c) => c.id === menu.chapterId) ?? null : null;
  const confirmingDelete = !!menu && deleteConfirmId === menu.chapterId;
  const scrollRef = useRef<HTMLDivElement>(null);
  // M9 Phase 2.2: virtualize chapter list. Fixed-ish row height keeps DOM cheap on 1000+ chapters.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
    getItemKey: (index) => {
      const row = rows[index];
      return row?.kind === "heading" ? row.id : row?.chapter.id ?? index;
    },
  });

  const handleMove = (chapterId: string, direction: -1 | 1) => {
    const idx = orderedIds.indexOf(chapterId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorder(next);
  };

  const handleRenameSubmit = () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) onRename(renamingId, name);
    setRenamingId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-200">章节</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-ink-100 hover:bg-ink-700/60 hover:text-ink-100 disabled:opacity-60"
              onClick={onImportMd}
              disabled={importing}
              title="从 Markdown 导入"
              aria-label={importing ? "正在导入 Markdown" : "从 Markdown 导入章节"}
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? "…" : "导入"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 bg-accent-600/20 text-accent-100 hover:bg-accent-600/30 hover:text-accent-100 disabled:opacity-60"
              onClick={onCreate}
              disabled={creating}
              aria-label={creating ? "正在创建新章节" : "新建章节"}
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "创建中…" : "新章"}
            </Button>
          </div>
        </div>
        <div className="relative mt-2">
          <label htmlFor="chapter-tree-search" className="sr-only">
            搜索章节
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            id="chapter-tree-search"
            className="h-8 w-full rounded-lg border border-ink-600 bg-ink-900 pl-8 pr-3 text-xs text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索章节"
          />
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <AnimatePresence initial={false} mode="wait">
          {chapters.length === 0 && (
            <motion.p
              key="empty-chapters"
              className="px-3 py-3 text-xs text-ink-400"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              还没有章节，点右上新建一章开始。
            </motion.p>
          )}
          {chapters.length > 0 && rows.length === 0 && (
            <motion.p
              key="no-chapter-match"
              className="px-3 py-3 text-xs text-ink-400"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              没有匹配的章节。
            </motion.p>
          )}
        </AnimatePresence>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const idx = vRow.index;
            const row = rows[idx];
            if (!row) return null;
            const chapter = row.chapter;
            const chapterActive = chapter.id === currentChapterId;
            const depth = row.depth;
            const isHeading = row.kind === "heading";
            const headingActive = isHeading && row.id === activeHeadingId;
            const duplicateHeading =
              isHeading &&
              (chapterHeadings[chapter.id] ?? []).filter((item) => item.title === row.heading.title).length > 1;
            const isRenaming = !isHeading && chapter.id === renamingId;
            const fullIndex = orderedIds.indexOf(chapter.id);
            return (
              <div
                key={vRow.key}
                data-index={idx}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                <div
                  className={`group flex items-center px-3 transition-colors ${
                    isHeading
                      ? headingActive
                        ? "mx-1 rounded-md bg-accent-500/12 py-1 text-xs font-medium text-accent-200 ring-1 ring-accent-500/15 hover:bg-accent-500/16"
                        : "mx-1 rounded-md py-1 text-xs text-ink-300 hover:bg-ink-700/35 hover:text-ink-100 dark:text-ink-500 dark:hover:bg-ink-700/20"
                      : chapterActive
                        ? "bg-accent-500/10 py-2 text-sm text-accent-200"
                        : "py-2 text-sm text-ink-100 hover:bg-ink-700/35 dark:text-ink-200 dark:hover:bg-ink-700/30"
                  }`}
                  style={{ paddingLeft: `${isHeading ? 14 + depth * 14 : 12 + depth * 14}px` }}
                  onContextMenu={(e) => {
                    if (isHeading) return;
                    e.preventDefault();
                    setDeleteConfirmId(null);
                    setMenu({ chapterId: chapter.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      className="flex-1 rounded-md bg-ink-800 px-2 py-1 text-sm text-ink-100 outline-none focus:ring-1 focus:ring-accent-500"
                      value={renameValue}
                      aria-label="章节名称"
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={handleRenameSubmit}
                    />
                  ) : (
                    <button
                      className="flex min-w-0 flex-1 items-center overflow-hidden text-left"
                      type="button"
                      aria-current={chapterActive || headingActive ? "true" : undefined}
                      onClick={() => {
                        if (isHeading) {
                          onSelectHeading?.(chapter.id, row.heading);
                        } else {
                          onSelect(chapter.id);
                        }
                      }}
                      onDoubleClick={() => {
                        if (isHeading) return;
                        setRenamingId(chapter.id);
                        setRenameValue(chapter.title);
                      }}
                      title={isHeading ? `跳到第 ${row.heading.line} 行` : undefined}
                      aria-label={
                        isHeading
                          ? `跳到 ${chapter.title} 的标题：${row.heading.title}`
                          : `打开章节：${chapter.title}`
                      }
                    >
                      <span className={`truncate ${isHeading ? "leading-5" : ""}`}>
                        {isHeading ? row.heading.title : chapter.title}
                      </span>
                      {isHeading ? (
                        duplicateHeading ? (
                          <span className="ml-2 shrink-0 rounded-full border border-ink-600/70 bg-ink-950/10 px-1.5 py-0.5 text-[10px] font-normal text-ink-400 dark:border-ink-700 dark:bg-ink-950/35">
                            {row.heading.line} 行
                          </span>
                        ) : null
                      ) : null}
                    </button>
                  )}
                  {!isRenaming && !isHeading && (
                    <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded px-1 text-xs text-ink-400 hover:bg-ink-700/60 hover:text-ink-200 disabled:opacity-40"
                        onClick={() => handleMove(chapter.id, -1)}
                        disabled={!!normalizedQuery || fullIndex <= 0}
                        title={normalizedQuery ? "搜索时不可调整顺序" : "上移"}
                        aria-label={`上移章节：${chapter.title}`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded px-1 text-xs text-ink-400 hover:bg-ink-700/60 hover:text-ink-200 disabled:opacity-40"
                        onClick={() => handleMove(chapter.id, 1)}
                        disabled={!!normalizedQuery || fullIndex >= orderedIds.length - 1}
                        title={normalizedQuery ? "搜索时不可调整顺序" : "下移"}
                        aria-label={`下移章节：${chapter.title}`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menu && (
          <motion.div
            ref={menuRef}
            className="fixed z-50 min-w-36 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 py-1 text-sm shadow-xl"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            aria-label="章节操作"
            variants={stateMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-ink-200 hover:bg-ink-700/60"
              onClick={() => {
                if (menuChapter) {
                  setRenamingId(menuChapter.id);
                  setRenameValue(menuChapter.title);
                }
                setMenu(null);
                setDeleteConfirmId(null);
              }}
              {...buttonMotion}
            >
              重命名
            </motion.button>
            <AnimatePresence initial={false} mode="wait">
              {confirmingDelete ? (
                <motion.div
                  key="delete-confirm"
                  role="none"
                  variants={stateMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="border-t border-ink-600 px-2 py-1.5"
                >
                  <div className="mb-1 truncate px-1 text-[11px] text-red-300">
                    确认删除「{menuChapter?.title ?? "章节"}」？
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      role="menuitem"
                      className="flex-1 rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-ink-700/60"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex-1 rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/25"
                      onClick={() => {
                        if (menuChapter) onDelete(menuChapter.id);
                        setMenu(null);
                        setDeleteConfirmId(null);
                      }}
                    >
                      确认删除
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="delete-start"
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/20"
                  onClick={() => setDeleteConfirmId(menu.chapterId)}
                  {...buttonMotion}
                >
                  删除
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
