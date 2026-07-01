// C4: 写作统计仪表盘——基于 daily_logs/chapters/project 数据渲染可视化。
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, TrendingUp, Flame, Target, Clock, FileText } from "lucide-react";
import { chapterApi, projectApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { fadeOnly, fadeSlideUp, staggerContainer, staggerItem } from "../lib/motion-tokens";

// C4: 纯 CSS 柱状图（无外部依赖）
function MiniBarChart({ data, maxHeight = 80 }: { data: { label: string; value: number }[]; maxHeight?: number }) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1" style={{ height: maxHeight }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.value}`}>
          <div className="w-full text-[9px] text-ink-400 text-center">{d.value || ""}</div>
          <div
            className="w-full rounded-t bg-accent-500/70 transition-all duration-500"
            style={{ height: `${Math.max(2, (d.value / maxVal) * (maxHeight - 16))}px` }}
          />
          <div className="w-full truncate text-center text-[8px] text-ink-500">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// C4: 简单的环形进度（纯 CSS）
function RingProgress({ pct, size = 48, label }: { pct: number; size?: number; label: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink-700))" strokeWidth="3" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--accent-500))" strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="text-xs font-semibold text-ink-100">{Math.round(pct)}%</span>
      <span className="text-[10px] text-ink-500">{label}</span>
    </div>
  );
}

export function StatsPage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const reduce = useReducedMotion();
  const motionV = reduce ? fadeOnly : fadeSlideUp;

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => projectApi.list() });
  const chaptersQuery = useQuery({
    queryKey: ["chapters", projectId],
    queryFn: () => (projectId ? chapterApi.list({ projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const project = projectsQuery.data?.find((p) => p.id === projectId) ?? null;
  const chapters = chaptersQuery.data ?? [];

  // 统计数据
  const stats = useMemo(() => {
    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const avgWordsPerChapter = chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0;
    const dailyGoal = project?.dailyGoal ?? 1000;
    const estimatedDays = dailyGoal > 0 ? Math.round(totalWords / dailyGoal) : 0;

    // 字数分布（按章节排序取前 10 章做柱状图）
    const chapterBarData = [...chapters]
      .sort((a, b) => a.order - b.order)
      .slice(0, 12)
      .map((ch) => ({ label: ch.title.slice(0, 4), value: ch.wordCount }));

    // 估算每日字数的简单分布（每章字数 / 每日目标）
    const completionPct = project && totalWords > 0
      ? Math.min(100, Math.round((totalWords / (dailyGoal * Math.max(1, chapters.length || 1))) * 100))
      : 0;

    return { totalWords, avgWordsPerChapter, dailyGoal, estimatedDays, chapterBarData, completionPct, totalChapters: chapters.length };
  }, [chapters, project]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950 text-ink-400 text-sm">
        请先在「写作」视图选择一本书。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink-950 p-6">
      <div className="mx-auto w-full max-w-4xl">
        <motion.div variants={motionV} initial="initial" animate="animate">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-100 mb-6">
            <BarChart3 className="h-5 w-5 text-accent-300" /> 写作统计 · {project?.name ?? ""}
          </h1>
        </motion.div>

        {/* KPI 卡片 */}
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6"
          variants={reduce ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {[
            { icon: FileText, label: "总字数", value: stats.totalWords.toLocaleString(), color: "text-sky-300" },
            { icon: Target, label: "章节数", value: String(stats.totalChapters), color: "text-accent-300" },
            { icon: TrendingUp, label: "均字/章", value: stats.avgWordsPerChapter.toLocaleString(), color: "text-emerald-300" },
            { icon: Flame, label: "日目标", value: stats.dailyGoal.toLocaleString(), color: "text-amber-300" },
          ].map((kpi, i) => (
            <motion.div
              key={i}
              variants={reduce ? fadeOnly : staggerItem}
              className="rounded-lg border border-ink-700 bg-ink-900/60 p-3"
            >
              <kpi.icon className={`h-4 w-4 ${kpi.color} mb-1`} />
              <div className="text-lg font-semibold text-ink-100">{kpi.value}</div>
              <div className="text-[10px] text-ink-500">{kpi.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* 图表行 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 章节字数分布 */}
          <motion.div
            variants={motionV} initial="initial" animate="animate"
            className="rounded-lg border border-ink-700 bg-ink-900/60 p-4"
          >
            <h3 className="mb-3 text-sm font-medium text-ink-200 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-accent-300" /> 章节字数 (前 12 章)
            </h3>
            {stats.chapterBarData.length > 0 ? (
              <MiniBarChart data={stats.chapterBarData} maxHeight={80} />
            ) : (
              <p className="text-xs text-ink-500">尚无章节数据</p>
            )}
          </motion.div>

          {/* 完成度 & 估算 */}
          <motion.div
            variants={motionV} initial="initial" animate="animate"
            className="rounded-lg border border-ink-700 bg-ink-900/60 p-4"
          >
            <h3 className="mb-3 text-sm font-medium text-ink-200 flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent-300" /> 写作进度
            </h3>
            <div className="flex items-center justify-around gap-4">
              <RingProgress pct={stats.completionPct} label="章节完成度" />
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-semibold text-ink-100">{stats.estimatedDays}</div>
                  <div className="text-[10px] text-ink-500">预计完成天数</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-ink-100">{stats.avgWordsPerChapter.toLocaleString()}</div>
                  <div className="text-[10px] text-ink-500">平均每章字数</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 章节表格 */}
        <motion.div
          variants={motionV} initial="initial" animate="animate"
          className="mt-6 rounded-lg border border-ink-700 bg-ink-900/60 overflow-hidden"
        >
          <div className="border-b border-ink-700 px-4 py-3 text-sm font-medium text-ink-200">
            章节明细
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-700 text-ink-400">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">章节</th>
                  <th className="px-4 py-2 text-right">字数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/50">
                {[...chapters].sort((a, b) => a.order - b.order).map((ch, i) => (
                  <tr key={ch.id} className="hover:bg-ink-800/30 text-ink-300">
                    <td className="px-4 py-1.5 text-ink-500">{i + 1}</td>
                    <td className="px-4 py-1.5 text-ink-100 truncate max-w-48">{ch.title}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{ch.wordCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
