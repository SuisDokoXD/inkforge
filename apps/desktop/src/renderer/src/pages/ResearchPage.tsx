import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSearchHit,
} from "@inkforge/shared";
import { chapterApi, researchApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { ResearchCredentialsDialog } from "../components/research/ResearchCredentialsDialog";

const PROVIDER_OPTIONS: Array<{ value: ResearchProvider; label: string }> = [
  { value: "tavily", label: "Tavily" },
  { value: "bing", label: "Bing Search" },
  { value: "serpapi", label: "SerpAPI" },
  { value: "llm-fallback", label: "LLM 综述（非实时）" },
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
      return researchApi.search({
        projectId,
        query: query.trim(),
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
          ? `已回退到 LLM 综述（${res.error ?? ""}）`
          : res.hits.length === 0
            ? `无结果${res.error ? `（${res.error}）` : ""}`
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
      setStatus("已保存到笔记");
      window.setTimeout(() => setStatus(null), 2000);
    },
    onError: (err) => {
      setStatus(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const insertMut = useMutation({
    mutationFn: async (hit: ResearchSearchHit) => {
      if (!currentChapterId) throw new Error("请先打开某一章节");
      const existing = await chapterApi.read({ id: currentChapterId });
      const topic = searchState?.topic || query.trim() || "资料";
      const quote = [
        "",
        "",
        `> 资料「${topic}」· ${hit.provider}${hit.url ? ` · ${hit.url}` : ""}`,
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

  const groupedNotes = useMemo(() => {
    const map = new Map<string, ResearchNoteRecord[]>();
    for (const note of notesQuery.data ?? []) {
      const list = map.get(note.topic) ?? [];
      list.push(note);
      map.set(note.topic, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [notesQuery.data]);

  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">📚 资料检索</div>
          <p className="text-sm">请先在侧边栏选择或创建一个项目。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-ink-900">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-800/40 px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && !searchMut.isPending) {
                searchMut.mutate();
              }
            }}
            placeholder="输入检索主题（例：洛阳 唐代 市井）"
            className="flex-1 rounded border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-100"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ResearchProvider)}
            className="rounded border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-100"
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
            className="rounded bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {searchMut.isPending ? "检索中…" : "🔍 搜索"}
          </button>
          <button
            type="button"
            onClick={() => setCredentialsOpen(true)}
            className="rounded border border-ink-700 px-2 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
            title="管理检索 provider 的 API Key"
          >
            🔑 凭证
          </button>
        </div>
        {status && (
          <div className="border-b border-ink-700 bg-ink-900/40 px-4 py-1 text-[11px] text-ink-400">
            {status}
          </div>
        )}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {!searchState && (
            <div className="flex h-full items-center justify-center text-center text-sm text-ink-400">
              输入主题、选择 provider、按回车或点「搜索」开始。
              <br />
              无 key 可用时会自动回退到 LLM 综述。
            </div>
          )}
          {searchState?.hits.map((hit, idx) => (
            <article
              key={`${hit.url}-${idx}`}
              className="border-b border-ink-700/60 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[11px] text-ink-400">
                <span className="rounded bg-ink-800 px-1.5 py-[1px]">
                  {hit.provider}
                </span>
                {hit.score !== undefined && (
                  <span>score {hit.score.toFixed(2)}</span>
                )}
                {hit.url && (
                  <a
                    href={hit.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sky-300 hover:underline"
                  >
                    {hit.url}
                  </a>
                )}
              </div>
              <h3 className="mt-1 text-sm font-medium text-ink-100">{hit.title}</h3>
              {hit.snippet && (
                <p className="mt-1 text-[13px] leading-6 text-ink-300 whitespace-pre-wrap">
                  {hit.snippet}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveMut.mutate(hit)}
                  disabled={saveMut.isPending}
                  className="rounded bg-ink-700/70 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
                >
                  📌 保存到笔记
                </button>
                <button
                  type="button"
                  onClick={() => insertMut.mutate(hit)}
                  disabled={insertMut.isPending || !currentChapterId}
                  className="rounded bg-ink-700/70 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-50"
                  title={currentChapterId ? "插入到当前章节末尾" : "请先在写作页打开章节"}
                >
                  ✂ 插入到章节
                </button>
                {hit.url && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(hit.url);
                      setStatus("已复制 URL");
                      window.setTimeout(() => setStatus(null), 1500);
                    }}
                    className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
                  >
                    复制 URL
                  </button>
                )}
              </div>
            </article>
          ))}
          {searchState && searchState.hits.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-400">
              没有命中任何结果{searchState.error ? `（${searchState.error}）` : ""}。
              <br />
              可尝试换关键词或切换到 LLM 综述。
            </div>
          )}
        </div>
      </section>

      <aside className="w-[300px] shrink-0 border-l border-ink-700 bg-ink-800/40">
        <div className="border-b border-ink-700 px-3 py-2 text-sm font-medium text-accent-300">
          我的笔记
          <span className="ml-2 text-[11px] text-ink-500">
            {(notesQuery.data ?? []).length} 条
          </span>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin p-2">
          {groupedNotes.length === 0 && (
            <div className="p-6 text-center text-xs text-ink-500">暂无笔记</div>
          )}
          {groupedNotes.map(([topic, list]) => (
            <details
              key={topic}
              className="mb-2 rounded border border-ink-700 bg-ink-900/40 text-xs"
              open
            >
              <summary className="cursor-pointer px-2 py-1.5 text-ink-200">
                {topic} <span className="text-ink-500">· {list.length}</span>
              </summary>
              <ul className="border-t border-ink-700/70">
                {list.map((note) => (
                  <li
                    key={note.id}
                    className="border-b border-ink-700/50 px-2 py-1.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-ink-500">
                      <span>{note.sourceProvider}</span>
                      <span>·</span>
                      <span>{new Date(note.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-ink-100">
                      {note.sourceTitle || note.excerpt.slice(0, 40) || "(无标题)"}
                    </div>
                    {note.excerpt && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-400">
                        {note.excerpt}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      {note.sourceUrl && (
                        <a
                          href={note.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:underline"
                        >
                          原文
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteNoteMut.mutate(note.id)}
                        className="text-red-300 hover:underline"
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </aside>

      <ResearchCredentialsDialog
        open={credentialsOpen}
        onClose={() => setCredentialsOpen(false)}
      />
    </div>
  );
}
