import type { BookSummary } from "@inkforge/shared";
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
  return (
    <div className="flex shrink-0 gap-4 border-b border-ink-700 bg-ink-900/40 p-4">
      <CoverUploader
        projectId={project.id}
        size="lg"
        editable={true}
        fallbackName={project.name}
      />
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-xl font-semibold text-ink-100">{project.name}</h1>
          <span className="text-xs text-ink-500">日均目标 {project.dailyGoal} 字</span>
          <div className="ml-auto flex items-center gap-1 text-[11px]">
            {onRename && (
              <button
                type="button"
                onClick={onRename}
                className="rounded border border-ink-700 px-2 py-0.5 text-ink-300 hover:border-sky-500/40 hover:text-sky-200"
                title="改名 / 修改基础信息"
              >
                ✏ 改名
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded border border-ink-700 px-2 py-0.5 text-ink-300 hover:border-accent-500/40 hover:text-accent-200"
                title="设定 / 全局世界观"
              >
                ⚙ 设定
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-300">
          <Stat label="总字数" value={fmtNum(totalWords)} />
          <Stat label="今日新增" value={fmtNum(todayWords)} accent={todayWords > 0} />
          <Stat label="章节" value={String(chapterCount)} />
          <Stat label="🤖 自动" value={String(originCounts["ai-auto"])} />
          <Stat label="✍🤖 陪写" value={String(originCounts["ai-assisted"])} />
          <Stat label="✍ 手写" value={String(originCounts.manual)} />
        </div>
        {lastChapterUpdatedAt && (
          <div className="text-xs text-ink-500">
            最近编辑：{new Date(lastChapterUpdatedAt).toLocaleString()}
          </div>
        )}
        {project.globalWorldview && project.globalWorldview.trim().length > 0 && (
          <div className="text-[11px] text-accent-300/80">
            🌍 已设定全局世界观（{project.globalWorldview.length} 字，自动写作会参考）
          </div>
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
