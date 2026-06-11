import type { ReactNode } from "react";
import { memo } from "react";

interface OutlineStatusTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  active: boolean;
}

export const OutlineStatusTile = memo(function OutlineStatusTile({
  icon,
  label,
  value,
  active,
}: OutlineStatusTileProps): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border border-ink-700 bg-ink-800/25 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <span className={active ? "text-accent-300" : "text-ink-500"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={
          active
            ? "mt-1 truncate text-sm font-medium text-ink-100"
            : "mt-1 truncate text-sm text-ink-500"
        }
      >
        {value}
      </div>
    </div>
  );
});
