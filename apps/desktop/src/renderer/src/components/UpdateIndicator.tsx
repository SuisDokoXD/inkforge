import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "@inkforge/shared";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  DUR,
  EASE_STANDARD,
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";

export function UpdateIndicator(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const { status: actionError, showStatus: showActionError } = useTimedStatus<string>();
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  useEffect(() => {
    void window.inkforge.update.status().then(setStatus).catch(() => undefined);
    const unsub = window.inkforge.update.onStatus(setStatus);
    return () => unsub();
  }, []);

  const runUpdateAction = (action: () => Promise<unknown>, fallback: string): void => {
    showActionError(null);
    void action().catch((err) => {
      showActionError(friendlyErrorMessage(err, fallback), 5000);
    });
  };

  let content: JSX.Element | null = null;

  if (status.state === "idle" || status.state === "not-available" || status.state === "checking") {
    content = (
      <motion.button
        key={status.state}
        type="button"
        className="inline-flex items-center gap-1 rounded border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700/60 hover:text-ink-100 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-ink-800/60 disabled:hover:text-ink-300"
        onClick={() => runUpdateAction(() => window.inkforge.update.check(), "检查更新失败，请稍后重试。")}
        disabled={status.state === "checking"}
        title="检查更新"
        aria-label={status.state === "checking" ? "正在检查更新" : "检查更新"}
        variants={stateMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        {...buttonMotion}
      >
        <motion.span
          className="inline-flex"
          animate={status.state === "checking" && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
          transition={
            status.state === "checking" && !reduceMotion
              ? { duration: 0.9, ease: "linear", repeat: Infinity }
              : { duration: DUR.fast }
          }
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </motion.span>
        {status.state === "checking" ? "检查中…" : "检查更新"}
      </motion.button>
    );
  }

  if (status.state === "available") {
    content = (
      <motion.div
        key={`available-${status.version}`}
        className="flex items-center gap-1"
        variants={stateMotion}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <span className="text-accent-300">新版本 v{status.version}</span>
        <motion.button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-accent-600/50 bg-accent-900/30 px-2 py-0.5 text-[11px] text-accent-200 hover:bg-accent-800/40"
          onClick={() => runUpdateAction(() => window.inkforge.update.download(), "下载更新失败，请稍后重试。")}
          {...buttonMotion}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          下载
        </motion.button>
        <motion.button
          type="button"
          className="inline-flex items-center rounded border border-ink-700 px-2 py-0.5 text-[11px] text-ink-400 hover:bg-ink-700/60"
          onClick={() => runUpdateAction(() => window.inkforge.update.openDownloadPage(), "打开下载页失败，请稍后重试。")}
          title="打开下载页"
          aria-label="打开下载页"
          {...buttonMotion}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </motion.button>
      </motion.div>
    );
  }

  if (status.state === "downloading") {
    content = (
      <motion.div
        key="downloading"
        className="flex min-w-36 items-center gap-2 text-accent-300"
        variants={stateMotion}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <span className="inline-flex items-center gap-1">
          <Download className="h-3.5 w-3.5" aria-hidden />
          下载中 {status.percent}%
        </span>
        <div
          className="h-1 w-16 overflow-hidden rounded-full bg-ink-700"
          role="progressbar"
          aria-label="更新下载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, status.percent))}
        >
          <motion.div
            className="h-full rounded-full bg-accent-400"
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, status.percent))}%` }}
            transition={{ duration: reduceMotion ? 0 : DUR.base, ease: EASE_STANDARD }}
          />
        </div>
      </motion.div>
    );
  }

  if (status.state === "downloaded") {
    content = (
      <motion.button
        key={`downloaded-${status.version}`}
        type="button"
        className="inline-flex items-center gap-1 rounded border border-green-600/50 bg-green-900/30 px-2 py-0.5 text-[11px] text-green-200 hover:bg-green-800/40"
        onClick={() => runUpdateAction(() => window.inkforge.update.install(), "安装更新失败，请稍后重试。")}
        title="退出并安装"
        variants={stateMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        {...buttonMotion}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        已下载 v{status.version} · 重启安装
      </motion.button>
    );
  }

  if (status.state === "error") {
    content = (
      <motion.button
        key={`error-${status.message}`}
        type="button"
        className="inline-flex items-center gap-1 rounded border border-red-600/50 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-800/40"
        onClick={() => runUpdateAction(() => window.inkforge.update.openDownloadPage(), "打开下载页失败，请稍后重试。")}
        title={status.message}
        variants={stateMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        {...buttonMotion}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        检查失败 · 打开下载页
      </motion.button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence initial={false} mode="wait">
        {content}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.span
            className="max-w-48 truncate text-[11px] text-red-300"
            role="alert"
            title={actionError}
            variants={stateMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {actionError}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
