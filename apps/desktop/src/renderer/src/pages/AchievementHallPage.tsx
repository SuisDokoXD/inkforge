import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ACHIEVEMENT_CATALOG,
  rarityColor,
  type AchievementDefinition,
  type AchievementRarity,
  type AchievementUnlockedRecord,
} from "@inkforge/shared";
import { achievementApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";

/**
 * 作家档案 + 成就大厅。
 * 顶部展示作家信息 + 总览数据；下方按 rarity / category 分组徽章。
 */
export function AchievementHallPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["achievement-stats", projectId],
    queryFn: () => achievementApi.stats({ projectId: projectId ?? "" }),
    enabled: !!projectId,
  });
  const listQuery = useQuery({
    queryKey: ["achievement-list", projectId],
    queryFn: () => achievementApi.list({ projectId: projectId ?? "" }),
    enabled: !!projectId,
  });
  const checkMut = useMutation({
    mutationFn: () =>
      achievementApi.check({ projectId: projectId ?? "", trigger: "manual" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievement-stats", projectId] });
      queryClient.invalidateQueries({ queryKey: ["achievement-list", projectId] });
    },
  });

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        请先在「写作」视图选择一本书。
      </div>
    );
  }

  const stats = statsQuery.data;
  const unlockedMap = new Map<string, AchievementUnlockedRecord>(
    (listQuery.data ?? []).map((r) => [r.achievementId, r]),
  );

  const grouped = groupByCategory(ACHIEVEMENT_CATALOG);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-br from-ink-900 via-ink-800/40 to-ink-900 p-6">
      <div className="mx-auto w-full max-w-4xl">
        {/* 作家档案 */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-accent-500/20 bg-gradient-to-br from-accent-500/10 via-fuchsia-500/5 to-sky-500/10 p-6 shadow-2xl">
          <div
            aria-hidden
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-400/10 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-fuchsia-400/10 blur-3xl"
          />

          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 via-orange-500 to-fuchsia-500 text-4xl shadow-lg">
              ✒
            </div>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-widest text-accent-300/80">
                InkForge · 作家档案
              </div>
              <div className="mt-1 text-2xl font-bold text-ink-50">
                你的写作档案
              </div>
              <div className="mt-1 text-xs text-ink-400">
                解锁 {stats?.totalUnlocked ?? "—"} / {stats?.totalCatalog ?? "—"} 成就
              </div>
            </div>
            <button
              type="button"
              onClick={() => checkMut.mutate()}
              disabled={checkMut.isPending}
              className="rounded-md bg-accent-500/20 px-3 py-1.5 text-xs text-accent-200 ring-1 ring-accent-400/30 hover:bg-accent-500/30 disabled:opacity-60"
            >
              {checkMut.isPending ? "扫描中…" : "🔍 重新扫描"}
            </button>
          </div>

          {/* 数据栅格 */}
          {stats && (
            <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="累计字数" value={fmtNum(stats.stats.totalWords)} />
              <Stat label="章节" value={String(stats.stats.totalChapters)} />
              <Stat label="人物档案" value={String(stats.stats.totalCharacters)} />
              <Stat label="世界观条目" value={String(stats.stats.totalWorldEntries)} />
              <Stat
                label="连续天数"
                value={`${stats.stats.streakDays} 天`}
                accent
              />
              <Stat
                label="最长连续"
                value={`${stats.stats.longestStreak} 天`}
              />
              <Stat
                label="自动写作"
                value={`${stats.stats.autoWriterRuns} 次`}
              />
              <Stat
                label="手动备份"
                value={`${stats.stats.snapshotsManual} 份`}
              />
            </div>
          )}

          {/* 稀有度计数 */}
          {stats && (
            <div className="relative mt-4 flex flex-wrap gap-2 text-[11px]">
              {(Object.keys(stats.byRarity) as AchievementRarity[]).map((r) => {
                const c = rarityColor(r);
                return (
                  <div
                    key={r}
                    className={`rounded-full px-2.5 py-0.5 ring-1 ${c.bg} ${c.text} ${c.ring}`}
                  >
                    {labelOfRarity(r)} · {stats.byRarity[r]}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 徽章网格 */}
        {Object.entries(grouped).map(([cat, defs]) => (
          <div key={cat} className="mb-5">
            <div className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink-100">
              {labelOfCategory(cat)}
              <span className="text-xs text-ink-500">{defs.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {defs.map((def) => {
                const unlocked = unlockedMap.has(def.id);
                const c = rarityColor(def.rarity);
                return (
                  <div
                    key={def.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                      unlocked
                        ? `${c.bg} ring-1 ${c.ring}`
                        : "border-ink-700 bg-ink-900/40 grayscale"
                    }`}
                  >
                    <span
                      className={`text-3xl ${unlocked ? "" : "opacity-40"}`}
                    >
                      {def.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-semibold ${
                          unlocked ? c.text : "text-ink-400"
                        }`}
                      >
                        {def.title}
                      </div>
                      <div className="line-clamp-2 text-[11px] text-ink-400">
                        {def.description}
                      </div>
                      <div className="mt-1 text-[10px] text-ink-500">
                        {unlocked
                          ? `🔓 ${new Date(unlockedMap.get(def.id)!.unlockedAt).toLocaleDateString()}`
                          : `🔒 ${def.hint}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-white/5 bg-ink-900/50 p-2.5">
      <div className="text-[10px] text-ink-500">{label}</div>
      <div
        className={`mt-0.5 text-base font-semibold ${
          accent ? "text-accent-300" : "text-ink-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n < 10_000) return String(n);
  return `${(n / 10_000).toFixed(1)} 万`;
}

function groupByCategory(
  defs: AchievementDefinition[],
): Record<string, AchievementDefinition[]> {
  const out: Record<string, AchievementDefinition[]> = {};
  for (const d of defs) {
    (out[d.category] ??= []).push(d);
  }
  return out;
}

function labelOfCategory(cat: string): string {
  const map: Record<string, string> = {
    milestone: "📊 里程碑",
    rhythm: "🔥 节奏",
    character: "👥 人物",
    world: "🌍 世界观",
    ai: "🤖 模型协作",
    craft: "🛠 匠艺",
  };
  return map[cat] ?? cat;
}

function labelOfRarity(r: AchievementRarity): string {
  switch (r) {
    case "common":
      return "普通";
    case "rare":
      return "稀有";
    case "epic":
      return "史诗";
    case "legendary":
      return "传说";
  }
}
