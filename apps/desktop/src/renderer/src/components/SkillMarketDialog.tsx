import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarketSkillMetaDTO } from "@inkforge/shared";
import { AnimatedDialog } from "./AnimatedDialog";

interface SkillMarketDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SkillMarketDialog({ open, onClose }: SkillMarketDialogProps): JSX.Element {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MarketSkillMetaDTO | null>(null);

  const registryQuery = useQuery({
    queryKey: ["market-registry"],
    queryFn: () => window.inkforge.market.fetchRegistry({}),
    enabled: open,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const installMutation = useMutation({
    mutationFn: (skill: MarketSkillMetaDTO) =>
      window.inkforge.market.installSkill({ url: skill.url, scope: skill.scope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const skills = registryQuery.data?.skills ?? [];
  const filtered = query
    ? skills.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()) ||
          s.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
      )
    : skills;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="Skill 市场"
      overlayClassName="flex items-center justify-center p-6"
      zClassName="z-40"
      panelClassName="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-ink-600 bg-ink-800 text-ink-100 shadow-2xl"
    >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-semibold">🛒 Skill 市场</h2>
          <button
            className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Left: list */}
          <div className="flex w-1/2 flex-col border-r border-ink-700">
            <div className="px-4 pb-2 pt-3">
              <input
                type="search"
                placeholder="搜索 skill…"
                className="w-full rounded border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-ink-400"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              {registryQuery.isLoading && (
                <div className="p-4 text-sm text-ink-400">加载中…</div>
              )}
              {registryQuery.isError && (
                <div className="p-4 text-sm text-red-400">
                  无法拉取 registry：{String(registryQuery.error)}
                  <button
                    className="ml-2 underline"
                    onClick={() => registryQuery.refetch()}
                  >
                    重试
                  </button>
                </div>
              )}
              {!registryQuery.isLoading && filtered.length === 0 && (
                <div className="p-4 text-sm text-ink-400">暂无匹配的 Skill</div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-ink-700 ${
                    selected?.id === s.id ? "bg-ink-700" : ""
                  }`}
                  onClick={() => setSelected(s)}
                >
                  <div className="font-medium">{s.title}</div>
                  <div className="line-clamp-1 text-xs text-ink-400">{s.description}</div>
                  <div className="mt-1 flex gap-1 text-[10px] text-ink-500">
                    <span>v{s.version}</span>
                    <span>·</span>
                    <span>{s.author}</span>
                    {s.tags.map((t) => (
                      <span key={t} className="rounded bg-ink-700 px-1">{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {/* Right: detail */}
          <div className="flex w-1/2 flex-col p-4 text-sm">
            {!selected && (
              <div className="text-ink-400">选择一个 Skill 查看详情</div>
            )}
            {selected && (
              <div className="flex h-full flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">{selected.title}</h3>
                  <div className="text-xs text-ink-400">
                    v{selected.version} · {selected.author}
                    {selected.license && ` · ${selected.license}`}
                  </div>
                </div>
                <p className="text-sm text-ink-200">{selected.description}</p>
                <div className="flex gap-1 text-xs">
                  {selected.tags.map((t) => (
                    <span key={t} className="rounded bg-ink-700 px-2 py-0.5 text-ink-300">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-500 disabled:opacity-50"
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate(selected)}
                  >
                    {installMutation.isPending
                      ? "安装中…"
                      : installMutation.isSuccess && installMutation.variables?.id === selected.id
                        ? "✓ 已安装"
                        : "安装"}
                  </button>
                  {selected.homepage && (
                    <a
                      href={selected.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-ink-600 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
                    >
                      主页
                    </a>
                  )}
                </div>
                {installMutation.isError && (
                  <div className="text-xs text-red-400">
                    安装失败：{String(installMutation.error)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </AnimatedDialog>
  );
}
