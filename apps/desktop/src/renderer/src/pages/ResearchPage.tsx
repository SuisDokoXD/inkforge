import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  KeyRound,
  Loader2,
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

const PROVIDER_OPTIONS: Array<{ value: ResearchProvider; label: string; hint: string }> = [
  { value: "llm-fallback", label: "LLM 综述", hint: "无搜索 key 时可用，适合先整理方向" },
  { value: "tavily", label: "Tavily", hint: "适合网页检索" },
  { value: "bing", label: "Bing Search", hint: "适合通用搜索" },
  { value: "serpapi", label: "SerpAPI", hint: "适合搜索结果聚合" },
];

const QUERY_CHIPS = [
  "时代背景",
  "城市风物",
  "职业细节",
  "器物制度",
  "饮食服饰",
  "真实案例",
  "地名路线",
  "术语解释",
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
}

export function ResearchPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<ResearchProvider>("llm-fallback");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["research-notes", projectId],
    queryFn: () =>
      projectId ? researchApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

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
      });
      setStatus(
        res.fellBackToLlm
          ? `已使用 LLM 综述${res.error ? `：${res.error}` : ""}`
          : res.hits.length === 0
            ? `没有命中结果${res.error ? `：${res.error}` : ""}`
            : `命中 ${res.hits.length} 条 · ${res.usedProvider}`,
      );
      window.setTimeout(() => setStatus(null), 3000);
    },
    onError: (err) => {
      setStatus(err instanceof Error ? err.message : String(err));
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
      setStatus("已保存到资料笔记");
      window.setTimeout(() => setStatus(null), 2000);
    },
    onError: (err) => {
      setStatus(`保存失败：${err instanceof Error ? err.message : String(err)}`);
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
        `> 资料《${topic}》 · ${hit.provider}${hit.url ? ` · ${hit.url}` : ""}`,
        `> ${hit.snippet || hit.title}`,
        "",
      ].join("\n");
      return chapterApi.update({
        id: currentChapterId,
        content: existing.content + quote,
      });
    },
    onSuccess: () => {
      setStatus("已插入当前章节末尾");
      window.setTimeout(() => setStatus(null), 2000);
    },
    onError: (err) => {
      setStatus(err instanceof Error ? err.message : String(err));
    },
  });

  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => researchApi.delete({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["research-notes", projectId] }),
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
                写作前查清背景，写作中保存出处。没有搜索凭证时，也可以先用 LLM 综述整理方向。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCredentialsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
              title="管理搜索 provider 的 API Key"
            >
              <KeyRound className="h-3.5 w-3.5" />
              检索凭证
            </button>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_190px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim() && !searchMut.isPending) {
                    searchMut.mutate();
                  }
                }}
                placeholder="输入要查的具体问题，例如：1930 年上海报馆编辑日常"
                className="w-full rounded-md border border-ink-700 bg-ink-950/70 py-2 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-600"
              />
            </div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ResearchProvider)}
              className="rounded-md border border-ink-700 bg-ink-950/70 px-2 py-2 text-sm text-ink-100"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => searchMut.mutate()}
              disabled={!query.trim() || searchMut.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {searchMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchMut.isPending ? "检索中" : "检索"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-500">{providerHint}</span>
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

        {status && (
          <div className="border-b border-ink-700 bg-ink-900/40 px-5 py-2 text-[11px] text-ink-400">
            {status}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          {!searchState ? (
            <ResearchStarter currentChapterReady={!!currentChapterId} />
          ) : (
            <SearchResults
              state={searchState}
              currentChapterReady={!!currentChapterId}
              savePending={saveMut.isPending}
              insertPending={insertMut.isPending}
              onSave={(hit) => saveMut.mutate(hit)}
              onInsert={(hit) => insertMut.mutate(hit)}
              onCopyUrl={(url) => {
                navigator.clipboard.writeText(url);
                setStatus("已复制 URL");
                window.setTimeout(() => setStatus(null), 1500);
              }}
            />
          )}
        </div>
      </section>

      <ResearchNotesSidebar
        notes={notes}
        groupedNotes={groupedNotes}
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
}: {
  currentChapterReady: boolean;
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
              不要只搜一个宽泛词。把问题写成“地点 + 时代 + 人物职业 + 场景细节”，
              更容易得到能放进小说里的信息。
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
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${
                currentChapterReady
                  ? "bg-emerald-500/15 text-emerald-700 ring-emerald-400/30 dark:text-emerald-200"
                  : "bg-ink-800 text-ink-400 ring-ink-700"
              }`}
            >
              {currentChapterReady ? "可插入章节" : "仅保存资料"}
            </span>
          </div>
        </section>
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
  onCopyUrl,
}: {
  state: SearchState;
  currentChapterReady: boolean;
  savePending: boolean;
  insertPending: boolean;
  onSave: (hit: ResearchSearchHit) => void;
  onInsert: (hit: ResearchSearchHit) => void;
  onCopyUrl: (url: string) => void;
}): JSX.Element {
  if (state.hits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md rounded-lg border border-dashed border-ink-700 bg-ink-900/35 p-6">
          <Search className="mx-auto h-7 w-7 text-ink-500" />
          <h2 className="mt-3 text-sm font-semibold text-ink-100">没有命中结果</h2>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            {state.error
              ? `检索返回：${state.error}`
              : "换一个更具体的问题，或切到 LLM 综述先整理关键词。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink-700/60">
      <div className="px-5 py-3 text-xs text-ink-400">
        主题：<span className="text-ink-200">{state.topic}</span>
        <span className="mx-2 text-ink-600">·</span>
        来源：{state.usedProvider ?? "unknown"}
        {state.fellBackToLlm && (
          <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-800 ring-1 ring-amber-400/20 dark:text-amber-200">
            已回退为 LLM 综述
          </span>
        )}
      </div>
      {state.hits.map((hit, idx) => (
        <article key={`${hit.url}-${idx}`} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
            <span className="rounded bg-ink-800 px-1.5 py-[1px]">{hit.provider}</span>
            {hit.score !== undefined && <span>score {hit.score.toFixed(2)}</span>}
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
            <button
              type="button"
              onClick={() => onSave(hit)}
              disabled={savePending}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-700/70 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-50"
            >
              <NotebookPen className="h-3.5 w-3.5" />
              保存资料
            </button>
            <button
              type="button"
              onClick={() => onInsert(hit)}
              disabled={insertPending || !currentChapterReady}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-700/70 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-50"
              title={currentChapterReady ? "插入到当前章节末尾" : "请先在写作页打开章节"}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              加入当前章末
            </button>
            {hit.url && (
              <button
                type="button"
                onClick={() => onCopyUrl(hit.url)}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                复制链接
              </button>
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
  onDelete,
}: {
  notes: ResearchNoteRecord[];
  groupedNotes: Array<[string, ResearchNoteRecord[]]>;
  onDelete: (id: string) => void;
}): JSX.Element {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-ink-700 bg-ink-900/45">
      <div className="border-b border-ink-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
            <NotebookPen className="h-4 w-4 text-accent-300" />
            我的资料
          </h2>
          <span className="rounded-full bg-ink-950/50 px-2 py-0.5 text-[11px] text-ink-400">
            {notes.length} 条
          </span>
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
                      <span>{note.sourceProvider}</span>
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
                      <button
                        type="button"
                        onClick={() => onDelete(note.id)}
                        className="inline-flex items-center gap-1 text-red-300 hover:underline"
                      >
                        <Trash2 className="h-3 w-3" />
                        删除
                      </button>
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
