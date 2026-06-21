import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BookMarked,
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  KeyRound,
  NotebookPen,
  Search,
  Trash2,
} from "lucide-react";
import type {
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSearchHit,
} from "@inkforge/shared";
import { chapterApi, researchApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { ResearchCredentialsDialog } from "../components/research/ResearchCredentialsDialog";
import { MotionSpinner } from "../components/MotionSpinner";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { friendlyActionError, friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import { Badge, Button, Select, TextField } from "../components/ui";

const PROVIDER_OPTIONS: Array<{ value: ResearchProvider; label: string; hint: string }> = [
  {
    value: "llm-fallback",
    label: "整理查找思路（不查网页）",
    hint: "不联网，只帮你整理关键词、背景方向和可追问的问题；真实地点、制度、事件请改用网页搜索。",
  },
  {
    value: "tavily",
    label: "快速网页搜索",
    hint: "联网查网页资料，适合地点、职业、制度、事件等事实信息。",
  },
  {
    value: "bing",
    label: "Bing 网页搜索",
    hint: "联网使用 Bing 搜索，适合需要更宽泛的中文或英文网页结果。",
  },
  {
    value: "serpapi",
    label: "多来源对照搜索",
    hint: "联网汇总搜索结果页，适合需要更多来源互相核对时使用。",
  },
];

function providerLabel(value: ResearchProvider | null | undefined): string {
  return PROVIDER_OPTIONS.find((item) => item.value === value)?.label ?? "未知来源";
}

const QUERY_CHIPS = [
  "时代背景",
  "城市风物",
  "职业细节",
  "器物制度",
  "维基百科",
  "日文资料",
  "英文资料",
  "官网/旅游",
  "地图/登山",
  "地名/山岳",
  "海拔/路线",
  "神社/传说",
  "饮食服饰",
  "真实案例",
];

const STARTER_CARDS = [
  {
    title: "先查事实",
    description: "把时代、职业、地理、器物这类容易出错的信息先查清楚。",
  },
  {
    title: "保存为项目资料",
    description: "有价值的结果存到右侧笔记，之后写作和整理资料时能继续引用。",
  },
  {
    title: "插入当前章节",
    description: "正在写某章时，可以把参考片段追加到章末，后续再改写进正文。",
  },
];

interface SearchState {
  topic: string;
  hits: ResearchSearchHit[];
  usedProvider: ResearchProvider | null;
  fellBackToLlm: boolean;
  error?: string;
  expandedQueries?: string[];
  attemptedProviders?: ResearchProvider[];
}

function researchErrorMessage(error?: string): string | null {
  if (!error) return null;
  if (error === "empty_query") return "请输入要检索的主题。";
  if (error === "no_hits") return "已经尝试扩展查法，但没有找到可用结果。";
  if (error === "all_providers_failed") return "所有检索来源都暂时不可用。";
  if (error.includes("api_key_missing")) {
    return "所选搜索服务还没有配置密钥，已尝试使用可用的兜底来源。";
  }
  if (error.includes("requires_provider")) {
    return "整理查找思路需要先配置一个可用的模型服务。";
  }
  if (error.includes("invalid_json")) {
    return "整理查找思路返回格式异常，请重试或换一个检索来源。";
  }
  return "检索服务返回异常，请换一个来源或稍后重试。";
}

export function ResearchPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const researchDraftQuery = useAppStore((s) => s.researchDraftQuery);
  const setResearchDraftQuery = useAppStore((s) => s.setResearchDraftQuery);
  const flowActions = useWritingFlowActions();
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<ResearchProvider>("llm-fallback");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const { status, showStatus } = useTimedStatus();
  const reduceMotion = useReducedMotion() === true;
  const statusMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  const notesQuery = useQuery({
    queryKey: ["research-notes", projectId],
    queryFn: () =>
      projectId ? researchApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  useEffect(() => {
    const trimmed = researchDraftQuery?.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSearchState(null);
    setResearchDraftQuery(null);
  }, [researchDraftQuery, setResearchDraftQuery]);

  const searchMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("no_project");
      const trimmed = query.trim();
      if (!trimmed) throw new Error("请输入要检索的主题");
      return researchApi.search({
        projectId,
        query: trimmed,
        provider,
      });
    },
    onSuccess: (res) => {
      setSearchState({
        topic: query.trim(),
        hits: res.hits,
        usedProvider: res.usedProvider,
        fellBackToLlm: !!res.fellBackToLlm,
        error: res.error,
        expandedQueries: res.expandedQueries,
        attemptedProviders: res.attemptedProviders,
      });
      const detail = researchErrorMessage(res.error);
      const queryCount = res.expandedQueries?.length ?? 1;
      showStatus(
        res.fellBackToLlm
          ? `已改用整理查找思路（不查网页）${detail ? `：${detail}` : ""}`
          : res.hits.length === 0
            ? `没有命中结果${detail ? `：${detail}` : ""}`
            : `命中 ${res.hits.length} 条 · 已尝试 ${queryCount} 种查法 · ${providerLabel(res.usedProvider)}`,
        3000,
      );
    },
    onError: (err) => {
      showStatus(friendlyErrorMessage(err, "检索失败，请换一个查法后重试。"));
    },
  });

  const saveMut = useMutation({
    mutationFn: async (hit: ResearchSearchHit) => {
      if (!projectId) throw new Error("no_project");
      return researchApi.save({
        projectId,
        topic: searchState?.topic || query.trim() || "未命名主题",
        sourceUrl: hit.url || null,
        sourceTitle: hit.title || null,
        sourceProvider: hit.provider,
        excerpt: hit.snippet,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["research-notes", projectId] });
      showStatus("已保存到资料笔记", 2000);
    },
    onError: (err) => {
      showStatus(friendlyActionError("保存失败", err));
    },
  });

  const insertMut = useMutation({
    mutationFn: async (hit: ResearchSearchHit) => {
      if (!currentChapterId) throw new Error("请先在写作页打开一个章节");
      const existing = await chapterApi.read({ id: currentChapterId });
      const topic = searchState?.topic || query.trim() || "资料";
      const quote = [
        "",
        "",
        `> 资料《${topic}》 · ${providerLabel(hit.provider)}${hit.url ? ` · ${hit.url}` : ""}`,
        `> ${hit.snippet || hit.title}`,
        "",
      ].join("\n");
      return chapterApi.update({
        id: currentChapterId,
        content: existing.content + quote,
      });
    },
    onSuccess: () => {
      showStatus("已插入当前章节末尾", 2000);
    },
    onError: (err) => {
      showStatus(friendlyActionError("插入章节失败", err));
    },
  });

  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => researchApi.delete({ id }),
    onMutate: () => {
      showStatus(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["research-notes", projectId] });
      showStatus("已删除资料", 2000);
    },
    onError: (err) => {
      showStatus(friendlyActionError("删除失败", err));
    },
  });

  const notes = notesQuery.data ?? [];
  const groupedNotes = useMemo(() => {
    const map = new Map<string, ResearchNoteRecord[]>();
    for (const note of notes) {
      const list = map.get(note.topic) ?? [];
      list.push(note);
      map.set(note.topic, list);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const newestA = new Date(a[1][0]?.createdAt ?? 0).getTime();
      const newestB = new Date(b[1][0]?.createdAt ?? 0).getTime();
      return newestB - newestA || b[1].length - a[1].length;
    });
  }, [notes]);

  const providerHint =
    PROVIDER_OPTIONS.find((item) => item.value === provider)?.hint ?? "";

  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-950/30 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-900/70 p-6 text-center">
          <BookMarked className="mx-auto h-8 w-8 text-accent-300" />
          <div className="mt-3 text-base font-semibold text-ink-100">资料检索</div>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            请先在侧边栏选择或创建一个项目，资料会按项目保存。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full bg-ink-950/20">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-ink-700 bg-ink-900/55 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-base font-semibold text-ink-100">
                <BookMarked className="h-4 w-4 text-accent-300" />
                资料检索
              </h1>
              <p className="mt-1 text-xs leading-5 text-ink-400">
                写作前查清背景，写作中保存出处。输入一个问题后，会自动扩展成多种查法。
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCredentialsOpen(true)}
              title="设置联网搜索服务"
            >
              <KeyRound className="h-3.5 w-3.5" />
              搜索服务设置
            </Button>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_210px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <TextField
                type="text"
                aria-label="资料检索问题"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim() && !searchMut.isPending) {
                    searchMut.mutate();
                  }
                }}
                placeholder="输入要查的具体问题，例如：富士山的地理、登山路线和民间传说"
                className="rounded-md border-ink-700 bg-ink-950/70 py-2 pl-9 pr-3 placeholder:text-ink-600"
              />
            </div>
            <Select
              value={provider}
              aria-label="选择检索来源"
              onChange={(e) => setProvider(e.target.value as ResearchProvider)}
              className="rounded-md border-ink-700 bg-ink-950/70 px-2 py-2"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Button
              size="md"
              variant="primary"
              className="px-4 py-2"
              onClick={() => searchMut.mutate()}
              disabled={!query.trim() || searchMut.isPending}
            >
              {searchMut.isPending ? (
                <MotionSpinner className="h-4 w-4" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchMut.isPending ? "检索中" : "检索"}
            </Button>
          </div>

          <div className="mt-2 rounded-md border border-ink-800 bg-ink-950/35 px-3 py-2 text-[11px] leading-5 text-ink-400">
            {providerHint}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {QUERY_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setQuery((prev) => (prev ? `${prev} ${chip}` : chip))}
                className="rounded-full border border-ink-700 bg-ink-950/35 px-2.5 py-1 text-[11px] text-ink-300 hover:border-accent-400/40 hover:text-accent-700 dark:hover:text-accent-200"
              >
                {chip}
              </button>
            ))}
          </div>
        </header>

        <AnimatePresence initial={false}>
          {status ? (
            <motion.div
              key="research-status"
              className="border-b border-ink-700 bg-ink-900/40 px-5 py-2 text-[11px] text-ink-400"
              role="status"
              variants={statusMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {status}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          {!searchState ? (
            <ResearchStarter
              currentChapterReady={!!currentChapterId}
              onOpenChapter={
                currentChapterId ? () => flowActions.openChapter(currentChapterId) : undefined
              }
            />
          ) : (
            <SearchResults
              state={searchState}
              currentChapterReady={!!currentChapterId}
              savePending={saveMut.isPending}
              insertPending={insertMut.isPending}
              onSave={(hit) => saveMut.mutate(hit)}
              onInsert={(hit) => insertMut.mutate(hit)}
              onOpenChapter={
                currentChapterId ? () => flowActions.openChapter(currentChapterId) : undefined
              }
              onCopyUrl={(url) => {
                navigator.clipboard.writeText(url);
                showStatus("已复制链接", 1500);
              }}
            />
          )}
        </div>
      </section>

      <ResearchNotesSidebar
        notes={notes}
        groupedNotes={groupedNotes}
        deletingNoteId={deleteNoteMut.isPending ? deleteNoteMut.variables : null}
        onDelete={(id) => deleteNoteMut.mutate(id)}
      />

      <ResearchCredentialsDialog
        open={credentialsOpen}
        onClose={() => setCredentialsOpen(false)}
      />
    </div>
  );
}

function ResearchStarter({
  currentChapterReady,
  onOpenChapter,
}: {
  currentChapterReady: boolean;
  onOpenChapter?: () => void;
}): JSX.Element {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-lg border border-ink-700 bg-ink-900/45 p-6">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-accent-700 dark:text-accent-200">从一个具体问题开始</div>
            <h2 className="mt-3 text-2xl font-semibold text-ink-50">
              资料页负责把“可能需要查”变成“已经有出处”。
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-300">
              不要只搜一个宽泛词。查真实地点、山脉、制度或历史时，优先选择联网搜索；
              再把问题写成“地点 + 时代 + 人物职业 + 场景细节”，更容易得到能放进小说里的信息。
              如果只是选择“整理查找思路（不查网页）”，它不会去网上查资料，只会帮你整理可能的关键词和提问方向。
            </p>
          </div>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          {STARTER_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-ink-700/80 bg-ink-900/35 p-4"
            >
              <div className="text-sm font-medium text-ink-100">{card.title}</div>
              <p className="mt-2 text-xs leading-5 text-ink-400">{card.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-lg border border-ink-700/80 bg-ink-900/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink-100">章节插入状态</div>
              <p className="mt-1 text-xs text-ink-400">
                {currentChapterReady
                  ? "已打开当前章节，检索结果可以直接追加到章末。"
                  : "还没有打开章节。保存资料不受影响，插入章节需要先回到写作页打开一章。"}
              </p>
            </div>
            <Badge tone={currentChapterReady ? "success" : "neutral"} size="md">
              {currentChapterReady ? "可插入章节" : "仅保存资料"}
            </Badge>
            {onOpenChapter && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onOpenChapter}
              >
                回到正文
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchQueryTrail({
  queries,
  className = "",
}: {
  queries?: string[];
  className?: string;
}): JSX.Element | null {
  const visibleQueries = (queries ?? []).filter(Boolean);
  if (visibleQueries.length <= 1) return null;
  return (
    <div className={className}>
      <div className="text-[11px] font-medium text-ink-300">已尝试的查法</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visibleQueries.map((item) => (
          <Badge
            key={item}
            tone="neutral"
            className="max-w-full bg-ink-950/40 px-2 py-1 text-[11px] font-normal leading-4 text-ink-400 ring-ink-700"
          >
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SearchResults({
  state,
  currentChapterReady,
  savePending,
  insertPending,
  onSave,
  onInsert,
  onOpenChapter,
  onCopyUrl,
}: {
  state: SearchState;
  currentChapterReady: boolean;
  savePending: boolean;
  insertPending: boolean;
  onSave: (hit: ResearchSearchHit) => void;
  onInsert: (hit: ResearchSearchHit) => void;
  onOpenChapter?: () => void;
  onCopyUrl: (url: string) => void;
}): JSX.Element {
  const queryCount = state.expandedQueries?.length ?? 1;
  const providerTrail =
    state.attemptedProviders && state.attemptedProviders.length > 1
      ? state.attemptedProviders.map((item) => providerLabel(item)).join(" → ")
      : null;

  if (state.hits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-xl rounded-lg border border-dashed border-ink-700 bg-ink-900/35 p-6">
          <Search className="mx-auto h-7 w-7 text-ink-500" />
          <h2 className="mt-3 text-sm font-semibold text-ink-100">没有命中结果</h2>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            {state.error
              ? researchErrorMessage(state.error)
              : "换一个更具体的问题，或切到整理查找思路先列关键词。"}
          </p>
          <SearchQueryTrail queries={state.expandedQueries} className="mt-4 text-left" />
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink-700/60">
      <div className="space-y-2 px-5 py-3 text-xs text-ink-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              主题：<span className="text-ink-200">{state.topic}</span>
            </span>
            <span className="text-ink-600">·</span>
            <span>来源：{providerLabel(state.usedProvider)}</span>
            <span className="text-ink-600">·</span>
            <span>已尝试 {queryCount} 种查法</span>
            {providerTrail && (
              <>
                <span className="text-ink-600">·</span>
                <span>尝试来源：{providerTrail}</span>
              </>
            )}
            {state.fellBackToLlm && (
              <Badge tone="warning" size="md" className="font-normal">
                已改用整理查找思路（不查网页）
              </Badge>
            )}
          </div>
          {onOpenChapter && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenChapter}
            >
              回到正文
            </Button>
          )}
        </div>
        <SearchQueryTrail queries={state.expandedQueries} />
      </div>
      {state.hits.map((hit, idx) => (
        <article key={`${hit.url}-${idx}`} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
            <Badge
              tone="neutral"
              className="bg-ink-800 px-1.5 py-[1px] text-[11px] font-normal text-ink-400 ring-ink-700"
            >
              {providerLabel(hit.provider)}
            </Badge>
            {hit.score !== undefined && <span>相关度 {hit.score.toFixed(2)}</span>}
            {hit.url && (
              <a
                href={hit.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-sky-300 hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{hit.url}</span>
              </a>
            )}
          </div>
          <h3 className="mt-2 text-sm font-medium text-ink-100">{hit.title}</h3>
          {hit.snippet && (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-ink-300">
              {hit.snippet}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSave(hit)}
              disabled={savePending}
            >
              <NotebookPen className="h-3.5 w-3.5" />
              保存资料
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onInsert(hit)}
              disabled={insertPending || !currentChapterReady}
              title={currentChapterReady ? "插入到当前章节末尾" : "请先在写作页打开章节"}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              加入当前章末
            </Button>
            {hit.url && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onCopyUrl(hit.url)}
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                复制链接
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ResearchNotesSidebar({
  notes,
  groupedNotes,
  deletingNoteId,
  onDelete,
}: {
  notes: ResearchNoteRecord[];
  groupedNotes: Array<[string, ResearchNoteRecord[]]>;
  deletingNoteId?: string | null;
  onDelete: (id: string) => void;
}): JSX.Element {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const confirmMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-ink-700 bg-ink-900/45">
      <div className="border-b border-ink-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
            <NotebookPen className="h-4 w-4 text-accent-300" />
            我的资料
          </h2>
          <Badge tone="neutral" size="sm" className="font-normal">
            {notes.length} 条
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          保存后的检索结果会按主题归档，作为这本书的资料库。
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 scrollbar-thin">
        {groupedNotes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-700 bg-ink-950/20 p-5 text-center">
            <NotebookPen className="mx-auto h-6 w-6 text-ink-600" />
            <div className="mt-3 text-sm font-medium text-ink-300">还没有保存资料</div>
            <p className="mt-2 text-xs leading-5 text-ink-500">
              检索后点“保存资料”，这里会自动按主题收纳，避免资料散在章节里。
            </p>
          </div>
        ) : (
          groupedNotes.map(([topic, list]) => (
            <details
              key={topic}
              className="mb-2 rounded-lg border border-ink-700 bg-ink-950/25 text-xs"
              open
            >
              <summary className="cursor-pointer px-3 py-2 text-ink-200">
                {topic} <span className="text-ink-500">· {list.length}</span>
              </summary>
              <ul className="border-t border-ink-700/70">
                {list.map((note) => (
                  <li
                    key={note.id}
                    className="border-b border-ink-700/50 px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-ink-500">
                      <span>{providerLabel(note.sourceProvider)}</span>
                      <span>·</span>
                      <span>{new Date(note.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                    <div className="mt-1 line-clamp-1 text-ink-100">
                      {note.sourceTitle || note.excerpt.slice(0, 40) || "无标题资料"}
                    </div>
                    {note.excerpt && (
                      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-400">
                        {note.excerpt}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[10px]">
                      {note.sourceUrl && (
                        <a
                          href={note.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          原文
                        </a>
                      )}
                      <AnimatePresence initial={false} mode="wait">
                        {deleteConfirmId === note.id ? (
                          <motion.div
                            key="delete-confirm"
                            className="flex flex-wrap items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-100"
                            variants={confirmMotion}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <span>确认删除？</span>
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-ink-300 hover:bg-ink-700"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-red-100 hover:bg-red-500/25 disabled:opacity-60"
                              disabled={deletingNoteId === note.id}
                              onClick={() => {
                                onDelete(note.id);
                                setDeleteConfirmId(null);
                              }}
                            >
                              {deletingNoteId === note.id ? "删除中" : "删除"}
                            </button>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="delete-start"
                            type="button"
                            onClick={() => setDeleteConfirmId(note.id)}
                            className="inline-flex items-center gap-1 text-red-300 hover:underline"
                            variants={fadeOnly}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                          >
                            <Trash2 className="h-3 w-3" />
                            删除
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </div>
    </aside>
  );
}
