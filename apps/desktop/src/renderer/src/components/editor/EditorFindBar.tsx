import type { RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface EditorFindBarProps {
  inputRef: RefObject<HTMLInputElement>;
  findText: string;
  setFindText: (value: string) => void;
  runFind: (backwards?: boolean) => void;
  onClose: () => void;
}

export function EditorFindBar({
  inputRef,
  findText,
  setFindText,
  runFind,
  onClose,
}: EditorFindBarProps): JSX.Element {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-ink-700 bg-ink-900/50 px-4 py-2 text-xs text-ink-300">
      <div className="flex w-full max-w-md items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 focus-within:border-accent-500">
        <Search className="h-3.5 w-3.5 text-ink-500" />
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
        <button
          className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-40"
          onClick={() => runFind(true)}
          disabled={!findText.trim()}
          title="上一个"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-40"
          onClick={() => runFind(false)}
          disabled={!findText.trim()}
          title="下一个"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
          onClick={onClose}
          title="关闭查找"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
