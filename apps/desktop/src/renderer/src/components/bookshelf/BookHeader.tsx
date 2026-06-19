import type { BookSummary } from "@inkforge/shared";
import { Globe2, Pencil, Settings } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../../lib/motion-tokens";
import { CoverUploader } from "./CoverUploader";

interface BookHeaderProps {
  book: BookSummary;
  /** v20: 打开「书籍设定 + 全局世界观」对话框 */
  onOpenSettings?: () => void;
  /** v20: 打开「书名 + 日均目标」编辑对话框 */
  onRename?: () => void;
}

function fmtNum(n: number): string {
  if (n < 10_000) return String(n);
  return `${(n / 10_000).toFixed(1)} 万`;
}

export function BookHeader({
  book,
  onOpenSettings,
  onRename,
}: BookHeaderProps): JSX.Element {
  const { project, chapterCount, totalWords, todayWords, originCounts, lastChapterUpdatedAt } =
    book;
  const reduceMotion = useReducedMotion() === true;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  return (
    <div className="flex shrink-0 gap-4 border-b border-ink-700 bg-ink-900/40 p-4">
      <CoverUploader
        projectId={project.id}
        size="lg"
        editable={true}
        fallbackName={project.name}
      />
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className="min-w-0 max-w-full truncate text-xl font-semibold text-ink-100">
                {project.name}
              </h1>
              <span className="shrink-0 text-xs text-ink-500">
                日均目标 {project.dailyGoal} 字
              </span>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 text-[11px]">
            {onRename && (
              <motion.button
                type="button"
                onClick={onRename}
                className="inline-flex items-center gap-1 rounded border border-ink-700 px-2 py-0.5 text-ink-300 hover:border-sky-500/40 hover:text-sky-200"
                aria-label={`编辑《${project.name}》的基础信息`}
                title="改名 / 修改基础信息"
                {...buttonMotion}
              >
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                改名
              </motion.button>
            )}
            {onOpenSettings && (
              <motion.button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded border border-ink-700 px-2 py-0.5 text-ink-300 hover:border-accent-500/40 hover:text-accent-200"
                aria-label={`打开《${project.name}》的设定和全局世界观`}
                title="设定 / 全局世界观"
                {...buttonMotion}
              >
                <Settings aria-hidden className="h-3.5 w-3.5" />
                设定
              </motion.button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-300">
          <Stat label="总字数" value={fmtNum(totalWords)} />
          <Stat label="今日新增" value={fmtNum(todayWords)} accent={todayWords > 0} />
          <Stat label="章节" value={String(chapterCount)} />
          <Stat label="模型初稿" value={String(originCounts["ai-auto"])} />
          <Stat label="模型陪写" value={String(originCounts["ai-assisted"])} />
          <Stat label="手写" value={String(originCounts.manual)} />
        </div>
        {lastChapterUpdatedAt && (
          <div className="text-xs text-ink-500">
            最近编辑：{new Date(lastChapterUpdatedAt).toLocaleString()}
          </div>
        )}
        {project.globalWorldview && project.globalWorldview.trim().length > 0 && (
          <motion.div
            className="flex items-center gap-1.5 text-[11px] text-accent-300/80"
            variants={stateMotion}
            initial="initial"
            animate="animate"
          >
            <Globe2 aria-hidden className="h-3.5 w-3.5" />
            已设定全局世界观（{project.globalWorldview.length} 字，模型写作会参考）
          </motion.div>
        )}
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
    <div className="flex items-baseline gap-1">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={accent ? "text-emerald-300" : "text-ink-100"}>{value}</span>
    </div>
  );
}
