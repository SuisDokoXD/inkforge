import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Edit3,
  FileText,
  Globe2,
  Layers3,
  Library,
  Lightbulb,
  MapPin,
  Plus,
  Route,
  Save,
  Search,
  ShieldCheck,
  StickyNote,
  Tags,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type {
  MaterialKind,
  MaterialRecord,
  ProjectRecord,
} from "@inkforge/shared";
import { materialApi, outlineGenApi, projectApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { SampleLibPanel } from "../components/SampleLibPanel";

type Tab = "materials" | "worldview" | "samples";
type KindFilter = MaterialKind | "all";

const KIND_OPTIONS: Array<{
  value: MaterialKind;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof Lightbulb;
}> = [
  {
    value: "idea",
    label: "灵感",
    description: "情节火花、设定念头、反转点",
    placeholder: "一句突然想到的梗、反转、氛围、主题意象。",
    icon: Lightbulb,
  },
  {
    value: "plot",
    label: "剧情线",
    description: "主线、支线、伏笔、冲突推进",
    placeholder: "起因 / 阻力 / 转折 / 结果 / 要埋的伏笔。",
    icon: Route,
  },
  {
    value: "character",
    label: "角色",
    description: "人物动机、关系、口吻、秘密",
    placeholder: "身份、欲望、恐惧、弱点、关系网、说话习惯。",
    icon: UserRound,
  },
  {
    value: "location",
    label: "地点",
    description: "城市、场景、组织据点、路线",
    placeholder: "空间结构、气味声音、势力归属、可发生的事件。",
    icon: MapPin,
  },
  {
    value: "world",
    label: "世界规则",
    description: "力量体系、禁忌、制度、历史",
    placeholder: "规则定义、代价、例外、谁知道、谁能利用。",
    icon: ShieldCheck,
  },
  {
    value: "fragment",
    label: "文本片段",
    description: "描写、台词、场景段落、可复用句群",
    placeholder: "可以直接粘进正文或改写后使用的段落。",
    icon: FileText,
  },
  {
    value: "reference",
    label: "资料",
    description: "考据、引用、外部信息摘录",
    placeholder: "来源、结论、可用于哪一章、仍需核实的点。",
    icon: BookOpen,
  },
  {
    value: "note",
    label: "随笔",
    description: "备忘、待办、创作判断",
    placeholder: "临时判断、待处理问题、下一步写作安排。",
    icon: StickyNote,
  },
];

const TAB_OPTIONS: Array<{ value: Tab; label: string; icon: typeof Layers3 }> = [
  { value: "materials", label: "分类素材", icon: Layers3 },
  { value: "worldview", label: "世界观草稿", icon: Globe2 },
  { value: "samples", label: "文风样本", icon: Library },
];

function parseTagInput(value: string): string[] {
  return value
    .split(/[，,\s]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, idx, arr) => arr.indexOf(t) === idx)
    .slice(0, 12);
}

function kindMeta(kind: MaterialKind) {
  return KIND_OPTIONS.find((o) => o.value === kind) ?? KIND_OPTIONS[0];
}

export function MaterialsPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const setProject = useAppStore((s) => s.setProject);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
  });
  const projects: ProjectRecord[] = projectsQuery.data ?? [];

  useEffect(() => {
    if (!projectId && projects.length > 0) setProject(projects[0].id);
  }, [projectId, projects, setProject]);

  const [tab, setTab] = useState<Tab>("materials");
  const currentProject = projects.find((p) => p.id === projectId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950/20">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-900/40 px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <Layers3 className="h-4 w-4 text-accent-300" />
          素材库
        </h2>
        <select
          value={projectId ?? ""}
          onChange={(e) => setProject(e.target.value || null)}
          className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-100"
        >
          <option value="">选择书籍</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 text-xs">
          {TAB_OPTIONS.map((item) => (
            <TabBtn
              key={item.value}
              label={item.label}
              icon={item.icon}
              active={tab === item.value}
              onClick={() => setTab(item.value)}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {!projectId ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-400">
            请先选择一本书。
          </div>
        ) : tab === "materials" ? (
          <MaterialsTab projectId={projectId} />
        ) : tab === "worldview" ? (
          <WorldviewTab project={currentProject} />
        ) : (
          <div className="p-4">
            <SampleLibPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Layers3;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 ${
        active
          ? "border-accent-500/50 bg-accent-500/15 text-accent-100"
          : "border-ink-700 text-ink-300 hover:bg-ink-800"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

function MaterialsTab({ projectId }: { projectId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const [filterKind, setFilterKind] = useState<KindFilter>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftKind, setDraftKind] = useState<MaterialKind>("idea");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const listQuery = useQuery({
    queryKey: ["materials", projectId],
    queryFn: () => materialApi.list({ projectId }),
  });
  const items = listQuery.data ?? [];

  const counts = useMemo(() => {
    const next = Object.fromEntries(
      ["all", ...KIND_OPTIONS.map((item) => item.value)].map((kind) => [kind, 0]),
    ) as Record<MaterialKind | "all", number>;
    next.all = items.length;
    for (const item of items) next[item.kind] += 1;
    return next;
  }, [items]);

  const commonTags = useMemo(() => {
    const tally = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) tally.set(tag, (tally.get(tag) ?? 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18);
  }, [items]);

  const activeKindMeta = draftKind ? kindMeta(draftKind) : KIND_OPTIONS[0];

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterKind !== "all" && item.kind !== filterKind) return false;
      if (selectedTag && !item.tags.includes(selectedTag)) return false;
      if (!keyword) return true;
      const haystack = [
        item.title,
        item.content,
        item.kind,
        ...item.tags,
      ].join("\n").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [filterKind, items, search, selectedTag]);

  const createMut = useMutation({
    mutationFn: () =>
      materialApi.create({
        projectId,
        kind: draftKind,
        title: draftTitle.trim(),
        content: draftContent,
        tags: parseTagInput(draftTags),
      }),
    onSuccess: () => {
      setDraftTitle("");
      setDraftTags("");
      setDraftContent("");
      queryClient.invalidateQueries({ queryKey: ["materials", projectId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => materialApi.delete({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials", projectId] }),
  });

  return (
    <div className="grid min-h-full grid-cols-[240px_minmax(0,1fr)] gap-0">
      <aside className="border-r border-ink-700 bg-ink-900/25 p-3">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-ink-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题、正文、标签"
            className="min-w-0 flex-1 bg-transparent text-xs text-ink-100 outline-none placeholder:text-ink-500"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-ink-500 hover:text-ink-200"
              title="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <nav className="space-y-1 text-xs">
          <KindButton
            label="全部素材"
            count={counts.all}
            icon={Layers3}
            active={filterKind === "all"}
            onClick={() => {
              setFilterKind("all");
              setSelectedTag(null);
            }}
          />
          {KIND_OPTIONS.map((item) => (
            <KindButton
              key={item.value}
              label={item.label}
              count={counts[item.value]}
              icon={item.icon}
              active={filterKind === item.value}
              onClick={() => setFilterKind(item.value)}
            />
          ))}
        </nav>

        {commonTags.length > 0 ? (
          <div className="mt-4 border-t border-ink-700 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-300">
              <Tags className="h-3.5 w-3.5" />
              常用标签
            </div>
            <div className="flex flex-wrap gap-1">
              {commonTags.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag((prev) => (prev === tag ? null : tag))}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    selectedTag === tag
                      ? "bg-accent-500/25 text-accent-100"
                      : "bg-ink-950 text-ink-400 hover:text-ink-200"
                  }`}
                >
                  #{tag} {count}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2 border-t border-ink-700 pt-3">
          {KIND_OPTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.value} className="flex gap-2 text-[11px] leading-5 text-ink-400">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                <div>
                  <span className="text-ink-200">{item.label}</span>
                  <span className="block">{item.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0 p-4">
        <section className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Metric label="总素材" value={String(items.length)} icon={Layers3} />
          <Metric label="剧情资产" value={String(counts.plot + counts.world)} icon={Route} />
          <Metric label="人物地点" value={String(counts.character + counts.location)} icon={UserRound} />
          <Metric label="资料片段" value={String(counts.reference + counts.fragment)} icon={BookOpen} />
        </section>

        <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/45 p-3">
          <div className="mb-2 grid grid-cols-[160px_minmax(0,1fr)_220px_auto] gap-2 text-xs">
            <select
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value as MaterialKind)}
              className="h-8 rounded-md border border-ink-700 bg-ink-950 px-2 text-ink-100"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="标题"
              className="h-8 rounded-md border border-ink-700 bg-ink-950 px-2 text-ink-100 placeholder:text-ink-500"
            />
            <div className="flex h-8 items-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-2">
              <Tags className="h-3.5 w-3.5 text-ink-500" />
              <input
                type="text"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="标签"
                className="min-w-0 flex-1 bg-transparent text-ink-100 outline-none placeholder:text-ink-500"
              />
            </div>
            <button
              type="button"
              disabled={!draftTitle.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-3 font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {createMut.isPending ? "保存中" : "新增"}
            </button>
          </div>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={4}
            placeholder={activeKindMeta.placeholder}
            className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-2 text-xs text-ink-100 placeholder:text-ink-500"
          />
        </section>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>{visibleItems.length} / {items.length} 条</span>
            {selectedTag ? (
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className="flex items-center gap-1 rounded bg-accent-500/15 px-2 py-0.5 text-accent-100"
              >
                #{selectedTag}
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          {listQuery.isFetching ? <span>刷新中</span> : null}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-700 py-12 text-center text-xs text-ink-500">
            {listQuery.isLoading ? "加载中" : "暂无匹配素材"}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {visibleItems.map((m) => (
              <MaterialRow
                key={m.id}
                item={m}
                onDelete={() => deleteMut.mutate(m.id)}
                projectId={projectId}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function KindButton({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: typeof Layers3;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left ${
        active ? "bg-accent-500/15 text-accent-100" : "text-ink-300 hover:bg-ink-800"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="rounded bg-ink-950 px-1.5 py-0.5 text-[10px] text-ink-400">
        {count}
      </span>
    </button>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Layers3;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/45 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-lg font-semibold text-ink-100">{value}</div>
    </div>
  );
}

function MaterialRow({
  item,
  onDelete,
  projectId,
}: {
  item: MaterialRecord;
  onDelete: () => void;
  projectId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<MaterialKind>(item.kind);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [tags, setTags] = useState(item.tags.join(" "));

  useEffect(() => {
    if (editing) return;
    setKind(item.kind);
    setTitle(item.title);
    setContent(item.content);
    setTags(item.tags.join(" "));
  }, [editing, item.content, item.kind, item.tags, item.title]);

  const saveMut = useMutation({
    mutationFn: () =>
      materialApi.update({
        id: item.id,
        kind,
        title: title.trim(),
        content,
        tags: parseTagInput(tags),
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["materials", projectId] });
    },
  });

  const meta = kindMeta(item.kind);
  const Icon = meta.icon;

  return (
    <li className="rounded-md border border-ink-700 bg-ink-900/45 p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-xs">
        {editing ? (
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MaterialKind)}
            className="h-7 rounded-md border border-ink-700 bg-ink-950 px-2 text-ink-100"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex h-7 shrink-0 items-center gap-1 rounded bg-ink-800 px-2 text-ink-200">
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        )}

        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-accent-500/40 bg-ink-950 px-2 text-ink-100"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium text-ink-100">{item.title}</span>
        )}

        <span className="hidden text-[10px] text-ink-500 2xl:block">
          {new Date(item.updatedAt).toLocaleString()}
        </span>
        {editing ? (
          <>
            <button
              type="button"
              disabled={!title.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="flex h-7 items-center gap-1 rounded-md bg-accent-500 px-2 text-[11px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-700 text-ink-300 hover:bg-ink-800"
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-700 text-ink-300 hover:bg-ink-800"
            title="编辑"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`删除素材《${item.title}》？`)) onDelete();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-700 text-ink-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex h-8 items-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-2 text-xs">
            <Tags className="h-3.5 w-3.5 text-ink-500" />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="标签"
              className="min-w-0 flex-1 bg-transparent text-ink-100 outline-none placeholder:text-ink-500"
            />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-2 text-xs text-ink-100"
          />
        </div>
      ) : (
        <>
          {item.tags.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-ink-950 px-1.5 py-0.5 text-[10px] text-ink-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          {item.content ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-ink-200 scrollbar-thin">
              {item.content}
            </pre>
          ) : (
            <p className="text-xs text-ink-500">无正文</p>
          )}
        </>
      )}
    </li>
  );
}

function WorldviewTab({ project }: { project: ProjectRecord | null }): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(project?.globalWorldview ?? "");
  }, [project?.globalWorldview, project?.id]);

  const saveMut = useMutation({
    mutationFn: () =>
      outlineGenApi.updateProjectMeta({
        projectId: project!.id,
        globalWorldview: draft,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
    },
  });

  if (!project) {
    return <div className="p-4 text-xs text-ink-500">请先选择一本书。</div>;
  }

  const dirty = draft !== (project.globalWorldview ?? "");

  return (
    <div className="p-4">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={22}
        placeholder="时代背景、力量体系、政治格局、关键禁忌、地理与组织关系"
        className="w-full resize-none rounded-md border border-ink-700 bg-ink-950 p-3 text-sm leading-6 text-ink-100 placeholder:text-ink-500"
      />
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
        <span>{draft.length} 字</span>
        <button
          type="button"
          disabled={!dirty || saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent-500 px-3 text-xs font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {saveMut.isPending ? "保存中" : dirty ? "保存" : "已保存"}
        </button>
      </div>
    </div>
  );
}
