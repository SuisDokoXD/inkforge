import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Award, RefreshCw } from "lucide-react";
import {
  ACHIEVEMENT_CATALOG,
  rarityColor,
  type AchievementDefinition,
  type AchievementRarity,
  type AchievementUnlockedRecord,
} from "@inkforge/shared";
import { achievementApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  DUR,
  fadeOnly,
  fadeSlideUp,
  staggerContainer,
  staggerItem,
} from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import { Badge, Button } from "../components/ui";

/**
 * 作家档案 + 成就大厅。
 * 顶部展示作家信息 + 总览数据；下方按 rarity / category 分组徽章。
 */
export function AchievementHallPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const queryClient = useQueryClient();
  const { status, showStatus } = useTimedStatus();
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const listMotion = reduceMotion ? fadeOnly : staggerContainer;
  const itemMotion = reduceMotion ? fadeOnly : staggerItem;

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
    onMutate: () => {
      showStatus(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["achievement-stats", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["achievement-list", projectId] });
      showStatus("成就扫描完成，新的解锁会出现在下方。", 2500);
    },
    onError: (err) => {
      showStatus(friendlyErrorMessage(err, "成就扫描失败，请稍后重试。"));
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
  const statusIsError = status !== null && /失败|无法|异常/.test(status);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink-950 p-6">
      <div className="mx-auto w-full max-w-4xl">
        {/* 作家档案 */}
        <motion.div
          className="mb-6 overflow-hidden rounded-lg border border-ink-700 bg-ink-900/60 p-6 shadow-lg"
          variants={stateMotion}
          initial="initial"
          animate="animate"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-accent-500/25 bg-accent-500/10 text-accent-200">
              <Award className="h-8 w-8" aria-hidden />
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
            <Button
              size="sm"
              variant="accentSoft"
              onClick={() => checkMut.mutate()}
              disabled={checkMut.isPending}
            >
              <motion.span
                className="inline-flex"
                animate={checkMut.isPending && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  checkMut.isPending && !reduceMotion
                    ? { duration: 0.9, ease: "linear", repeat: Infinity }
                    : { duration: DUR.fast }
                }
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              </motion.span>
              {checkMut.isPending ? "扫描中…" : "重新扫描"}
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {status ? (
              <motion.div
                key="achievement-status"
                className={`mt-4 rounded-md border px-3 py-2 text-xs ${
                  statusIsError
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : "border-ink-700 bg-ink-950/45 text-ink-300"
                }`}
                role={statusIsError ? "alert" : "status"}
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {status}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* 数据栅格 */}
          {stats && (
            <motion.div
              className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
              variants={listMotion}
              initial="initial"
              animate="animate"
            >
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
                label="续写精修"
                value={`${stats.stats.autoWriterRuns} 次`}
              />
              <Stat
                label="手动备份"
                value={`${stats.stats.snapshotsManual} 份`}
              />
            </motion.div>
          )}

          {/* 稀有度计数 */}
          {stats && (
            <motion.div
              className="mt-4 flex flex-wrap gap-2 text-[11px]"
              variants={listMotion}
              initial="initial"
              animate="animate"
            >
              {(Object.keys(stats.byRarity) as AchievementRarity[]).map((r) => {
                const c = rarityColor(r);
                return (
                  <motion.div
                    key={r}
                    variants={itemMotion}
                  >
                    <Badge size="md" className={c.bg + " " + c.text + " " + c.ring}>
                      {labelOfRarity(r)} · {stats.byRarity[r]}
                    </Badge>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.div>

        {/* 徽章网格 */}
        {Object.entries(grouped).map(([cat, defs]) => (
          <div key={cat} className="mb-5">
            <div className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink-100">
              {labelOfCategory(cat)}
              <span className="text-xs text-ink-500">{defs.length}</span>
            </div>
            <motion.div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
              variants={listMotion}
              initial="initial"
              animate="animate"
            >
              {defs.map((def) => {
                const unlocked = unlockedMap.has(def.id);
                const c = rarityColor(def.rarity);
                return (
                  <motion.div
                    key={def.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      unlocked
                        ? `${c.bg} ring-1 ${c.ring}`
                        : "border-ink-700 bg-ink-900/40 opacity-70"
                    }`}
                    variants={itemMotion}
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
                          ? `已解锁 · ${new Date(unlockedMap.get(def.id)!.unlockedAt).toLocaleDateString()}`
                          : `未解锁 · ${def.hint}`}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
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
    <div className="rounded-lg border border-white/5 bg-ink-950/45 p-2.5">
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
    milestone: "里程碑",
    rhythm: "节奏",
    character: "人物",
    world: "世界观",
    ai: "模型协作",
    craft: "匠艺",
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
