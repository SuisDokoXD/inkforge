import type { SampleLibRecord } from "@inkforge/shared";
import { BookOpenText } from "lucide-react";

interface SampleReferencePickerProps {
  libs: SampleLibRecord[];
  selectedIds: string[];
  onChange(selectedIds: string[]): void;
  disabled?: boolean;
  className?: string;
}

export function SampleReferencePicker({
  libs,
  selectedIds,
  onChange,
  disabled = false,
  className = "",
}: SampleReferencePickerProps): JSX.Element | null {
  if (libs.length === 0) return null;

  const autoMode = selectedIds.length === 0;
  const selectedSet = new Set(selectedIds);

  const enterManualMode = (): void => {
    if (selectedIds.length > 0) return;
    onChange([libs[0].id]);
  };

  const toggleLib = (libId: string): void => {
    if (disabled || autoMode) return;
    if (selectedSet.has(libId)) {
      if (selectedIds.length <= 1) return;
      onChange(selectedIds.filter((id) => id !== libId));
      return;
    }
    onChange([...selectedIds, libId]);
  };

  return (
    <fieldset className={`rounded-md border border-ink-700 bg-ink-900/35 p-3 ${className}`}>
      <legend className="sr-only">参考文集</legend>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-200">
          <BookOpenText className="h-3.5 w-3.5 text-accent-300" />
          参考文集
        </div>
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400">
          {autoMode ? "自动匹配片段" : `只参考 ${selectedIds.length} 本`}
        </span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-300">
          <input
            aria-label="自动选择参考文集"
            type="radio"
            checked={autoMode}
            disabled={disabled}
            onChange={() => onChange([])}
            className="accent-accent-500"
          />
          自动匹配
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-300">
          <input
            aria-label="只使用手动勾选的参考文集"
            type="radio"
            checked={!autoMode}
            disabled={disabled}
            onChange={enterManualMode}
            className="accent-accent-500"
          />
          只用所选文集
        </label>
      </div>

      <div className="mt-2 grid max-h-28 gap-1 overflow-y-auto pr-1 scrollbar-thin">
        {libs.map((lib) => {
          const checked = autoMode || selectedSet.has(lib.id);
          const lockedLast = !autoMode && checked && selectedIds.length <= 1;
          return (
            <label
              key={lib.id}
              className={`flex min-w-0 items-center gap-2 rounded px-2 py-1 text-[11px] ${
                autoMode ? "text-ink-500" : "text-ink-300 hover:bg-ink-800"
              }`}
              title={`${lib.title}${lib.author ? ` · ${lib.author}` : ""}`}
            >
              <input
                aria-label={`使用参考文集 ${lib.title}`}
                type="checkbox"
                checked={checked}
                disabled={disabled || autoMode || lockedLast}
                onChange={() => toggleLib(lib.id)}
                className="accent-accent-500"
              />
              <span className="min-w-0 flex-1 truncate text-ink-200">{lib.title}</span>
              <span className="shrink-0 text-ink-500">
                {lib.author ? `${lib.author} · ` : ""}
                {lib.chunkCount} 章
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
