import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ShieldAlert } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { terminalApi } from "../lib/api";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../lib/motion-tokens";

const DANGER_PATTERN =
  /\b(rm\s+-rf\b|rm\s+-fr\b|sudo\s+rm\b|del\s+\/(?:s|f|q)\b|rmdir\s+\/s\b|format\s+[a-z]:|shutdown\b|diskpart\b|mkfs\b|dd\s+if=|>\s*\/dev\/sd[a-z])/i;

interface TerminalPanelProps {
  height: number;
  onClose: () => void;
  onResizeDrag: (delta: number) => void;
}

export function TerminalPanel({ height, onClose, onResizeDrag }: TerminalPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lineBufferRef = useRef<string>("");
  const dangerPendingRef = useRef<boolean>(false);
  const cancelDangerButtonRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "exited" | "error">("starting");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [shellLabel, setShellLabel] = useState<string>("");
  const [dangerConfirmLine, setDangerConfirmLine] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const dangerMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: "#0f141b",
        foreground: "#d5dbe5",
        cursor: "#f5b450",
        selectionBackground: "#3b4252",
      },
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = (): { cols: number; rows: number } | null => {
      try {
        fit.fit();
        return { cols: term.cols, rows: term.rows };
      } catch {
        return null;
      }
    };

    const dims = safeFit();

    const handleData = (data: string): void => {
      const id = sessionIdRef.current;
      if (!id) return;
      if (dangerPendingRef.current) return;
      // Track the current line locally to intercept dangerous commands when Enter is pressed.
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          const candidate = lineBufferRef.current;
          if (DANGER_PATTERN.test(candidate) && !dangerPendingRef.current) {
            dangerPendingRef.current = true;
            setDangerConfirmLine(candidate);
            lineBufferRef.current = "";
            return;
          }
          lineBufferRef.current = "";
        } else if (ch === "\u007f" || ch === "\b") {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
        } else if (ch === "\u0003" || ch === "\u0015") {
          // Ctrl-C / Ctrl-U clears line
          lineBufferRef.current = "";
        } else if (ch >= " ") {
          lineBufferRef.current += ch;
        }
      }
      void terminalApi.input({ id, data });
    };

    const dataDisposer = term.onData(handleData);

    const offData = terminalApi.onData((payload) => {
      if (disposed) return;
      if (payload.id !== sessionIdRef.current) return;
      term.write(payload.data);
    });

    const offExit = terminalApi.onExit((payload) => {
      if (disposed) return;
      if (payload.id !== sessionIdRef.current) return;
      setStatus("exited");
      term.write(`\r\n\x1b[33m[会话已结束，退出码 ${payload.exitCode}]\x1b[0m\r\n`);
    });

    void (async () => {
      try {
        const response = await terminalApi.spawn({
          cols: dims?.cols,
          rows: dims?.rows,
        });
        if (disposed) {
          void terminalApi.dispose({ id: response.id });
          return;
        }
        sessionIdRef.current = response.id;
        setShellLabel(`${response.shell}  ·  ${response.cwd}`);
        setStatus("ready");
        term.focus();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setErrorText(msg);
        setStatus("error");
        term.write(`\r\n\x1b[31m无法启动终端：${msg}\x1b[0m\r\n`);
      }
    })();

    const observer = new ResizeObserver(() => {
      const next = safeFit();
      const id = sessionIdRef.current;
      if (next && id) void terminalApi.resize({ id, cols: next.cols, rows: next.rows });
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      dataDisposer.dispose();
      offData();
      offExit();
      observer.disconnect();
      const id = sessionIdRef.current;
      if (id) void terminalApi.dispose({ id });
      sessionIdRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    // When parent changes height we must re-fit.
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const id = sessionIdRef.current;
        const term = termRef.current;
        if (term && id) void terminalApi.resize({ id, cols: term.cols, rows: term.rows });
      } catch {
        // ignore
      }
    }, 16);
    return () => clearTimeout(t);
  }, [height]);

  useEffect(() => {
    if (!dangerConfirmLine) return;
    cancelDangerButtonRef.current?.focus();
  }, [dangerConfirmLine]);

  const restoreTerminalFocus = (): void => {
    requestAnimationFrame(() => termRef.current?.focus());
  };

  const cancelDangerCommand = (): void => {
    const id = sessionIdRef.current;
    dangerPendingRef.current = false;
    setDangerConfirmLine(null);
    if (id) {
      // Swallow the pending Enter and clear the line visually.
      void terminalApi.input({ id, data: "\u0015" });
    }
    restoreTerminalFocus();
  };

  const confirmDangerCommand = (): void => {
    const id = sessionIdRef.current;
    dangerPendingRef.current = false;
    setDangerConfirmLine(null);
    if (id) void terminalApi.input({ id, data: "\r" });
    restoreTerminalFocus();
  };

  const onDragStart = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const startY = event.clientY;
    const onMove = (e: MouseEvent): void => {
      onResizeDrag(startY - e.clientY);
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onResizeDrag(24);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onResizeDrag(-24);
    }
  };

  const onDangerConfirmKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelDangerCommand();
  };

  return (
    <div
      className="flex shrink-0 flex-col border-t border-ink-700 bg-[#0f141b]"
      style={{ height }}
    >
      <div
        role="separator"
        aria-label="调整终端高度"
        aria-orientation="horizontal"
        tabIndex={0}
        className="h-1.5 cursor-row-resize bg-ink-700/80 hover:bg-accent-500/60 focus:bg-accent-500 focus:outline-none"
        onMouseDown={onDragStart}
        onKeyDown={onResizeKeyDown}
        title="拖动调整高度"
      />
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900/70 px-3 py-1 text-[11px] text-ink-400">
        <div className="flex items-center gap-3">
          <span className="font-medium text-ink-200">终端</span>
          <span className="truncate text-ink-500">{shellLabel || "…"}</span>
          {status === "exited" && <span className="text-accent-400">已结束</span>}
          {status === "error" && <span className="text-red-400">启动失败{errorText ? `：${errorText}` : ""}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded px-2 py-0.5 text-ink-400 hover:bg-ink-700"
            onClick={onClose}
            title="关闭终端"
          >
            关闭
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {dangerConfirmLine ? (
          <motion.div
            key="danger-confirm"
            role="alert"
            variants={dangerMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            onKeyDown={onDangerConfirmKeyDown}
            className="flex flex-wrap items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
          >
            <ShieldAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">检测到可能危险的命令</span>
            <code className="max-w-[42rem] truncate rounded bg-ink-950/70 px-1.5 py-0.5 text-[11px] text-rose-100">
              {dangerConfirmLine}
            </code>
            <div className="ml-auto flex gap-1">
              <motion.button
                ref={cancelDangerButtonRef}
                type="button"
                onClick={cancelDangerCommand}
                className="rounded border border-ink-600 px-2 py-1 text-ink-200 hover:bg-ink-800"
                {...buttonMotion}
              >
                取消
              </motion.button>
              <motion.button
                type="button"
                onClick={confirmDangerCommand}
                className="rounded bg-rose-500/20 px-2 py-1 font-medium text-rose-100 hover:bg-rose-500/30"
                {...buttonMotion}
              >
                确认执行
              </motion.button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="min-h-0 flex-1 bg-[#0f141b] px-2 py-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
