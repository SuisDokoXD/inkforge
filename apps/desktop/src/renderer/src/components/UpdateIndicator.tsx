import { useEffect, useState } from "react";
import type { UpdateStatus } from "@inkforge/shared";

export function UpdateIndicator(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    void window.inkforge.update.status().then(setStatus).catch(() => undefined);
    const unsub = window.inkforge.update.onStatus(setStatus);
    return () => unsub();
  }, []);

  if (status.state === "idle" || status.state === "not-available" || status.state === "checking") {
    return (
      <button
        type="button"
        className="rounded border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
        onClick={() => void window.inkforge.update.check()}
        title="检查更新"
      >
        {status.state === "checking" ? "⟳ 检查中…" : "⟳ 检查更新"}
      </button>
    );
  }

  if (status.state === "available") {
    return (
      <div className="flex items-center gap-1">
        <span className="text-accent-300">⬆ 新版本 v{status.version}</span>
        <button
          type="button"
          className="rounded border border-accent-600/50 bg-accent-900/30 px-2 py-0.5 text-[11px] text-accent-200 hover:bg-accent-800/40"
          onClick={() => void window.inkforge.update.download()}
        >
          下载
        </button>
        <button
          type="button"
          className="rounded border border-ink-700 px-2 py-0.5 text-[11px] text-ink-400 hover:bg-ink-700/60"
          onClick={() => void window.inkforge.update.openDownloadPage()}
          title="打开 Releases 页"
        >
          ↗
        </button>
      </div>
    );
  }

  if (status.state === "downloading") {
    return (
      <span className="text-accent-300">
        ⇣ 下载中 {status.percent}%
      </span>
    );
  }

  if (status.state === "downloaded") {
    return (
      <button
        type="button"
        className="rounded border border-green-600/50 bg-green-900/30 px-2 py-0.5 text-[11px] text-green-200 hover:bg-green-800/40"
        onClick={() => void window.inkforge.update.install()}
        title="退出并安装"
      >
        ✓ 已下载 v{status.version} · 重启安装
      </button>
    );
  }

  if (status.state === "error") {
    return (
      <button
        type="button"
        className="rounded border border-red-600/50 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-800/40"
        onClick={() => void window.inkforge.update.openDownloadPage()}
        title={status.message}
      >
        ⚠ 检查失败 · 打开下载页
      </button>
    );
  }

  return null;
}
