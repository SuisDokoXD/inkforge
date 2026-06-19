import { Component, useId, type ErrorInfo, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronDown, ClipboardCopy, RotateCcw } from "lucide-react";
import { t, coerceLang, type Lang } from "@inkforge/shared";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";

interface ErrorBoundaryProps {
  /** Human name shown in the title, e.g. "Editor" / "Review". */
  label?: string;
  /** UI language; defaults to zh. */
  lang?: Lang;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Children to guard. */
  children: ReactNode;
  /** Called when an error is caught (for local logging). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  showDetails: boolean;
}

/**
 * Catches render-time errors inside a subtree and shows a friendly fallback
 * with stack details + "copy diagnostic" action. Global + per-page usage is
 * the M6-D convention: never let a broken route white-screen the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep local logging cheap; main process handles persistence.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.label ?? "root", error, info);
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null, showDetails: false });
  };

  private toggleDetails = (): void => {
    this.setState((s) => ({ showDetails: !s.showDetails }));
  };

  private copyDiag = async (): Promise<void> => {
    try {
      const bridge = (window as unknown as { inkforge?: { diag?: { snapshot?: (p: object) => Promise<{ text: string }> } } }).inkforge;
      const snap = await bridge?.diag?.snapshot?.({});
      const payload = [
        `位置：${this.props.label ?? "应用主界面"}`,
        `错误摘要：${this.state.error?.message ?? "暂无错误摘要"}`,
        "",
        "错误细节（供排查）：",
        this.state.error?.stack ?? "暂无调用栈信息",
        "",
        "环境信息：",
        snap?.text ?? "暂时无法读取环境信息",
      ].join("\n");
      await navigator.clipboard.writeText(payload);
    } catch {
      // best-effort; clipboard may fail in headless env.
    }
  };

  render(): ReactNode {
    const { error, showDetails } = this.state;
    const { children, fallback, label, lang } = this.props;
    if (!error) return children;

    if (fallback) return fallback(error, this.reset);

    const l = coerceLang(lang);
    const title = t("error.boundary.title", l);
    const retry = t("common.retry", l);
    const copyDiag = t("error.boundary.copyDiag", l);
    const shortDesc = label
      ? `${label} 暂时无法显示。可以重试，或复制排查信息发给维护者。`
      : "此区域暂时无法显示。可以重试，或复制排查信息发给维护者。";

    return (
      <ErrorFallbackView
        title={title}
        description={shortDesc}
        retryLabel={retry}
        copyLabel={copyDiag}
        showDetails={showDetails}
        onRetry={this.reset}
        onCopy={this.copyDiag}
        onToggleDetails={this.toggleDetails}
      />
    );
  }
}

function ErrorFallbackView({
  title,
  description,
  retryLabel,
  copyLabel,
  showDetails,
  onRetry,
  onCopy,
  onToggleDetails,
}: {
  title: string;
  description: string;
  retryLabel: string;
  copyLabel: string;
  showDetails: boolean;
  onRetry(): void;
  onCopy(): void;
  onToggleDetails(): void;
}): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const detailsId = useId();

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <motion.div
        className="max-w-lg rounded-lg border border-red-900/60 bg-red-950/40 p-5 text-sm text-ink-100 shadow-lg ring-1 ring-red-500/10"
        variants={panelMotion}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-red-500/10 p-2 text-red-300 ring-1 ring-red-400/20">
            <AlertTriangle aria-hidden className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-red-300">{title}</div>
            <div className="mt-1 text-ink-300">{description}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-ink-600 bg-ink-800 px-3 py-1 text-xs hover:bg-ink-700"
            onClick={onRetry}
            {...buttonMotion}
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            {retryLabel}
          </motion.button>
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-ink-600 bg-ink-800 px-3 py-1 text-xs hover:bg-ink-700"
            onClick={onCopy}
            {...buttonMotion}
          >
            <ClipboardCopy aria-hidden className="h-3.5 w-3.5" />
            {copyLabel}
          </motion.button>
          <motion.button
            type="button"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-400 hover:text-ink-200"
            onClick={onToggleDetails}
            aria-expanded={showDetails}
            aria-controls={detailsId}
            {...buttonMotion}
          >
            <motion.span
              aria-hidden
              className="inline-flex"
              animate={{ rotate: showDetails ? 180 : 0 }}
              transition={SPRING_SNAPPY}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
            排查说明
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {showDetails ? (
            <motion.div
              id={detailsId}
              key="details"
              className="mt-3 rounded bg-ink-900/80 p-3 text-xs leading-6 text-ink-300"
              variants={panelMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              原始错误细节已隐藏，避免把内部调用信息直接显示在写作界面。需要排查时，请点击“{copyLabel}”。
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
