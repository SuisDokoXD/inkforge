import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, MapPin, Plus, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { ManualSubmissionCheckIssue, ManualSubmissionCheckReport } from "../../lib/manual-submission-check";
import { Badge, IconButton } from "../ui";

interface ManualSubmissionCheckMenuProps {
  report: ManualSubmissionCheckReport;
  checkedVersion: string | null;
  contentVersion: string;
  focusMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onJumpIssue: (issue: ManualSubmissionCheckIssue) => void;
  onCreateBeat: (text: string) => void;
  onMarkChecked: () => void;
}

export function ManualSubmissionCheckMenu({
  report,
  checkedVersion,
  contentVersion,
  focusMode,
  open: controlledOpen,
  onOpenChange,
  onJumpIssue,
  onCreateBeat,
  onMarkChecked,
}: ManualSubmissionCheckMenuProps): JSX.Element {
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
  const isReady = report.status === "ready";
  const checkedFresh = checkedVersion !== null && contentVersion === checkedVersion;
  const title = isReady ? "交稿检查 · 可交稿" : `交稿检查 · ${report.issueCount} 项`;

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
        variant={open ? "accentSoft" : "ghost"}
        aria-label={title}
        title={title}
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ClipboardCheck className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="交稿检查"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">交稿检查</span>
                <Badge tone={isReady ? "success" : "warning"} className="rounded px-1.5 font-normal">
                  {isReady ? "可交稿" : `${report.issueCount} 项`}
                </Badge>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭交稿检查"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="border-b border-ink-800 p-3">
              <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950/35 p-2">
                {isReady ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink-100">
                    {isReady ? "本章没有明显手动交稿阻碍" : report.primaryIssue?.title ?? "还有项目待处理"}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-500">
                    {checkedFresh ? "本轮已检查" : "正文变动后建议重新检查"}
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
              {report.issues.length > 0 ? (
                report.issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onJump={() => onJumpIssue(issue)}
                    onCreateBeat={() => onCreateBeat(issue.beatText)}
                  />
                ))
              ) : (
                <div className="flex items-center gap-2 px-3 py-6 text-ink-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>当前章节可以进入下一轮处理。</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-ink-800 p-3">
              <span className="text-[11px] text-ink-500">
                {checkedFresh ? "已记录本轮检查" : "尚未记录本轮检查"}
              </span>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-500/15 px-2.5 text-accent-100 hover:bg-accent-500/25"
                onClick={onMarkChecked}
                aria-label="标记本轮已检查"
                title="标记本轮已检查"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                已检查
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function IssueRow({
  issue,
  onJump,
  onCreateBeat,
}: {
  issue: ManualSubmissionCheckIssue;
  onJump: () => void;
  onCreateBeat: () => void;
}): JSX.Element {
  const canJump = Boolean(issue.jumpText || issue.healthIssue?.jumpText);
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-ink-800 px-3 py-2 last:border-b-0 hover:bg-ink-800/45">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink-100">{issue.title}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-ink-500">第 {issue.line} 行</span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ink-500" title={issue.detail}>{issue.detail}</div>
      </div>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-ink-300 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-35"
        onClick={onJump}
        disabled={!canJump}
        aria-label={`跳到${issue.title}`}
        title={canJump ? "跳转" : "暂无可跳转位置"}
      >
        <MapPin className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent-500/15 px-2 text-accent-100 hover:bg-accent-500/25"
        onClick={onCreateBeat}
        aria-label={`加入接力：${issue.beatText}`}
        title="加入接力"
      >
        <Plus className="h-3.5 w-3.5" />
        接力
      </button>
    </div>
  );
}