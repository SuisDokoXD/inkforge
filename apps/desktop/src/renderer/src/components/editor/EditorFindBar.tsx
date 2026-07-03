import type { RefObject } from "react";
import { ChevronDown, ChevronUp, Replace, ReplaceAll, Search, X } from "lucide-react";
import type { TextFindOptions } from "@inkforge/editor";

interface EditorFindBarProps {
  inputRef: RefObject<HTMLInputElement>;
  findText: string;
  setFindText: (value: string) => void;
  replaceText: string;
  setReplaceText: (value: string) => void;
  options: TextFindOptions;
  onOptionsChange: (options: TextFindOptions) => void;
  matchCount: number;
  activeIndex: number;
  status: string | null;
  replaceConfirm: boolean;
  runFind: (backwards?: boolean) => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

function toggleClass(active: boolean): string {
  return active
    ? "border-accent-500/40 bg-accent-500/15 text-accent-100"
    : "border-ink-600 bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100";
}

export function EditorFindBar({
  inputRef,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  options,
  onOptionsChange,
  matchCount,
  activeIndex,
  status,
  replaceConfirm,
  runFind,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: EditorFindBarProps): JSX.Element {
  const hasQuery = !!findText.trim();
  const hasMatches = matchCount > 0;
  const matchLabel = hasQuery
    ? hasMatches
      ? `${activeIndex + 1}/${matchCount}`
      : "0/0"
    : "-/-";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-ink-700 bg-ink-900/75 px-4 py-2 text-xs text-ink-300">
      <div className="flex min-w-[16rem] flex-1 items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 focus-within:border-accent-500 md:max-w-md">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <input
          ref={inputRef}
          aria-label="在当前章节中查找"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          value={findText}
          onChange={(event) => setFindText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runFind(event.shiftKey);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="在当前章节中查找"
        />
        <span className="w-12 shrink-0 text-center tabular-nums text-ink-500" aria-live="polite">
          {matchLabel}
        </span>
        <button
          type="button"
          className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-40"
          onClick={() => runFind(true)}
          disabled={!hasQuery}
          title="上一个"
          aria-label="上一个匹配"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-40"
          onClick={() => runFind(false)}
          disabled={!hasQuery}
          title="下一个"
          aria-label="下一个匹配"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`h-8 rounded-md border px-2 text-[11px] font-medium ${toggleClass(options.caseSensitive)}`}
          onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
          title="区分大小写"
          aria-label="区分大小写"
          aria-pressed={options.caseSensitive}
        >
          Aa
        </button>
        <button
          type="button"
          className={`h-8 rounded-md border px-2 text-[11px] font-medium ${toggleClass(options.wholeWord)}`}
          onClick={() => onOptionsChange({ ...options, wholeWord: !options.wholeWord })}
          title="全字匹配"
          aria-label="全字匹配"
          aria-pressed={options.wholeWord}
        >
          词
        </button>
      </div>
      <div className="flex min-w-[14rem] items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 focus-within:border-accent-500 md:w-72">
        <Replace className="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <input
          aria-label="替换为"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          value={replaceText}
          onChange={(event) => setReplaceText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onReplaceCurrent();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="替换为"
        />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-40"
          onClick={onReplaceCurrent}
          disabled={!hasMatches}
          title="替换当前匹配"
          aria-label="替换当前匹配"
        >
          <Replace className="h-3.5 w-3.5" />
          当前
        </button>
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-40 ${
            replaceConfirm
              ? "border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20"
              : "border-ink-600 bg-ink-800 text-ink-200 hover:bg-ink-700"
          }`}
          onClick={onReplaceAll}
          disabled={!hasMatches}
          title={replaceConfirm ? "确认全部替换" : "全部替换"}
          aria-label={replaceConfirm ? "确认全部替换" : "全部替换"}
        >
          <ReplaceAll className="h-3.5 w-3.5" />
          {replaceConfirm ? "确认" : "全部"}
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
          onClick={onClose}
          title="关闭查找"
          aria-label="关闭查找"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {status ? (
        <span
          className="min-w-[5rem] text-right text-[11px] text-ink-500"
          role={status.includes("未") || status.includes("没有") ? "alert" : "status"}
          aria-live="polite"
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}
