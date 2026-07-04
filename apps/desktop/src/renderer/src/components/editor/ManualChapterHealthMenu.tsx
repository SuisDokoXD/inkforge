import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, AlertTriangle, CheckCircle2, FileText, ListChecks, MapPin, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { ManualChapterHealthIssue, ManualChapterHealthReport } from "../../lib/manual-chapter-health";
import { Badge, IconButton } from "../ui";

interface ManualChapterHealthMenuProps {
  report: ManualChapterHealthReport;
  focusMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onJumpIssue: (issue: ManualChapterHealthIssue) => void;
}

export function ManualChapterHealthMenu({
  report,
  focusMode,
  open: controlledOpen,
  onOpenChange,
  onJumpIssue,
}: ManualChapterHealthMenuProps): JSX.Element {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback((nextOpen: boolean | ((value: boolean) => boolean)) => {
    const resolvedOpen = typeof nextOpen === "function" ? nextOpen(controlledOpen ?? localOpen) : nextOpen;
    if (controlledOpen === undefined) setLocalOpen(resolvedOpen);
    onOpenChange?.(resolvedOpen);
  }, [controlledOpen, localOpen, onOpenChange]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const issueCount = report.issues.length;
  const hasContent = report.graphemes > 0;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : issueCount > 0 ? "ghost" : "ghost"}
        aria-label={hasContent ? `章节体检，${issueCount} 个提醒` : "章节体检，当前章节为空"}
        title={hasContent ? `章节体检 · ${issueCount} 个提醒` : "章节体检"}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Activity className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[25rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="章节体检"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">章节体检</span>
                <Badge tone={issueCount > 0 ? "warning" : "success"} className="rounded px-1.5 font-normal">
                  {issueCount > 0 ? `${issueCount} 个提醒` : "平稳"}
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭章节体检"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 border-b border-ink-800 p-3">
              <Metric label="字数" value={report.graphemes} />
              <Metric label="段落" value={report.paragraphs} />
              <Metric label="场景" value={report.scenes} />
              <Metric label="待补" value={report.todos} />
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-ink-800 px-3 py-2 text-[11px] text-ink-400">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-ink-500" />
                标题 {report.headings}
              </span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5 text-ink-500" />
                分隔 {report.sceneBreaks}
              </span>
              <span>均段 {report.averageParagraphGraphemes}</span>
            </div>

            <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
              {issueCount > 0 ? (
                report.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex min-w-0 items-start gap-2 border-b border-ink-800 px-3 py-2 last:border-b-0 hover:bg-ink-800/45"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-ink-100">{issue.title}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-500">
                          第 {issue.line} 行
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-ink-500" title={issue.detail}>
                        {issue.detail}
                      </div>
                    </div>
                    {issue.jumpText ? (
                      <button
                        type="button"
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-ink-300 hover:bg-ink-700 hover:text-ink-100"
                        onClick={() => onJumpIssue(issue)}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        跳转
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 px-3 py-6 text-ink-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>当前章节没有明显结构提醒。</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/35 px-2 py-1.5">
      <div className="text-[10px] text-ink-500">{label}</div>
      <div className="mt-0.5 tabular-nums text-ink-100">{value}</div>
    </div>
  );
}
