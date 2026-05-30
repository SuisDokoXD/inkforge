import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MaterialKind,
  MaterialRecord,
  ProjectRecord,
} from "@inkforge/shared";
import { materialApi, outlineGenApi, projectApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { SampleLibPanel } from "../components/SampleLibPanel";

type Tab = "samples" | "notes" | "worldview";

const KIND_OPTIONS: { value: MaterialKind; label: string; icon: string }[] = [
  { value: "idea", label: "灵感", icon: "💡" },
  { value: "fragment", label: "片段", icon: "✒" },
  { value: "reference", label: "参考", icon: "📎" },
  { value: "note", label: "随笔", icon: "📝" },
];

/**
 * v20: 独立的「素材库」顶级页面。三个 Tab：
 *  - 文风样本：复用 SampleLibPanel（参考库 / EPUB 导入，AutoWriter 文风学习用）
 *  - 灵感速记：CRUD `materials` 表（idea / fragment / reference / note）
 *  - 世界观草稿：编辑 project.globalWorldview（AutoWriter 自动注入）
 */
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

  const [tab, setTab] = useState<Tab>("notes");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-900/40 px-4 py-2">
        <h2 className="text-sm font-semibold text-ink-100">🗂 素材库</h2>
        <select
          value={projectId ?? ""}
          onChange={(e) => setProject(e.target.value || null)}
          className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
        >
          <option value="">— 选择书籍 —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <TabBtn label="💡 灵感速记" active={tab === "notes"} onClick={() => setTab("notes")} />
          <TabBtn label="🌍 世界观草稿" active={tab === "worldview"} onClick={() => setTab("worldview")} />
          <TabBtn label="📚 文风样本" active={tab === "samples"} onClick={() => setTab("samples")} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
        {!projectId ? (
          <div className="m-auto max-w-md text-center text-sm text-ink-400">
            请先选择一本书。
          </div>
        ) : tab === "notes" ? (
          <NotesTab projectId={projectId} />
        ) : tab === "worldview" ? (
          <WorldviewTab project={projects.find((p) => p.id === projectId) ?? null} />
        ) : (
          <SampleLibPanel />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 ${
        active
          ? "border-accent-500/50 bg-accent-500/15 text-accent-100"
          : "border-ink-700 text-ink-300 hover:bg-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

// ----- Tab: 灵感速记 -----
function NotesTab({ projectId }: { projectId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const [filterKind, setFilterKind] = useState<MaterialKind | "">("");
  const listQuery = useQuery({
    queryKey: ["materials", projectId, filterKind || "all"],
    queryFn: () =>
      materialApi.list({
        projectId,
        kind: filterKind === "" ? undefined : filterKind,
      }),
  });
  const items = listQuery.data ?? [];

  const [draftKind, setDraftKind] = useState<MaterialKind>("idea");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      materialApi.create({
        projectId,
        kind: draftKind,
        title: draftTitle.trim(),
        content: draftContent,
      }),
    onSuccess: () => {
      setDraftTitle("");
      setDraftContent("");
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => materialApi.delete({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-ink-700 bg-ink-800/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-ink-300">新建：</span>
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as MaterialKind)}
            className="rounded border border-ink-700 bg-ink-900 px-2 py-0.5"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.icon} {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="标题（必填）"
            className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-0.5"
          />
          <button
            type="button"
            disabled={!draftTitle.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="rounded bg-accent-500/30 px-2 py-0.5 text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
          >
            {createMut.isPending ? "保存中…" : "保存"}
          </button>
        </div>
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={3}
          placeholder="正文 / 细节 / 备注"
          className="w-full rounded border border-ink-700 bg-ink-900 p-2 text-xs"
        />
      </section>

      <section className="flex items-center gap-2 text-xs text-ink-300">
        <span>筛选：</span>
        <button
          type="button"
          onClick={() => setFilterKind("")}
          className={`rounded px-2 py-0.5 ${filterKind === "" ? "bg-accent-500/30 text-accent-100" : "border border-ink-700"}`}
        >
          全部 ({items.length})
        </button>
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setFilterKind(o.value)}
            className={`rounded px-2 py-0.5 ${filterKind === o.value ? "bg-accent-500/30 text-accent-100" : "border border-ink-700"}`}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </section>

      {items.length === 0 ? (
        <div className="py-10 text-center text-xs text-ink-500">
          {listQuery.isLoading ? "加载中…" : "还没有素材，先在上面建一条吧"}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <MaterialRow key={m.id} item={m} onDelete={() => deleteMut.mutate(m.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MaterialRow({
  item,
  onDelete,
}: {
  item: MaterialRecord;
  onDelete: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);

  const saveMut = useMutation({
    mutationFn: () =>
      materialApi.update({
        id: item.id,
        title: title.trim(),
        content,
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const opt = KIND_OPTIONS.find((o) => o.value === item.kind);

  return (
    <li className="rounded-md border border-ink-700 bg-ink-800/40 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="rounded bg-ink-700 px-1.5 py-0.5 text-ink-200">
          {opt?.icon} {opt?.label ?? item.kind}
        </span>
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded border border-accent-500/40 bg-ink-900 px-2 py-0.5"
          />
        ) : (
          <span className="flex-1 truncate font-medium text-ink-100">{item.title}</span>
        )}
        <span className="text-[10px] text-ink-500">
          {new Date(item.updatedAt).toLocaleString()}
        </span>
        {editing ? (
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            className="rounded bg-accent-500/30 px-2 py-0.5 text-[11px] text-accent-100 hover:bg-accent-500/40"
          >
            保存
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-ink-700 px-2 py-0.5 text-[11px] hover:bg-ink-700"
          >
            编辑
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`删除素材《${item.title}》？`)) onDelete();
          }}
          className="rounded border border-ink-700 px-2 py-0.5 text-[11px] hover:bg-rose-500/30 hover:text-rose-100"
        >
          🗑
        </button>
      </div>
      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="w-full rounded border border-ink-700 bg-ink-900 p-2 text-xs"
        />
      ) : (
        item.content && (
          <pre className="whitespace-pre-wrap text-xs text-ink-200">
            {item.content}
          </pre>
        )
      )}
    </li>
  );
}

// ----- Tab: 世界观草稿 -----
function WorldviewTab({ project }: { project: ProjectRecord | null }): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(project?.globalWorldview ?? "");
  }, [project?.id, project?.globalWorldview]);

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

  if (!project) return <div className="text-xs text-ink-500">请先选择一本书</div>;
  const dirty = draft !== (project.globalWorldview ?? "");

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-accent-500/30 bg-accent-500/5 p-3 text-xs text-accent-100/90">
        🌍 这里写的内容会作为「全局世界观」被 AutoWriter 在每段开始前注入到 prompt
        中。建议写 <strong>时代背景 / 力量体系 / 政治格局 / 关键禁忌</strong>。
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={20}
        placeholder="例如：这是一个修真复辟的近未来世界。元婴期以下不得乘坐空艇……"
        className="w-full resize-none rounded-md border border-ink-700 bg-ink-900 p-3 text-sm font-mono"
      />
      <div className="flex items-center justify-between text-[11px] text-ink-500">
        <span>
          {draft.length} 字
          {draft.length > 4000 && (
            <span className="ml-2 text-accent-300">⚠ 偏长，建议控制在 2000 字内</span>
          )}
        </span>
        <button
          type="button"
          disabled={!dirty || saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="rounded-md bg-accent-500/30 px-3 py-1 text-xs font-semibold text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
        >
          {saveMut.isPending ? "保存中…" : dirty ? "保存" : "已保存"}
        </button>
      </div>
    </div>
  );
}
