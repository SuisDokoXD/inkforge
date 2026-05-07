// M9 Phase 4.2: shared empty-state placeholder. Use across pages for consistent guidance.
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Big emoji or short glyph; SVG icon when 3.3 lands. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary CTA. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Secondary CTA, e.g. "Read docs". */
  secondary?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action, secondary }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="text-5xl opacity-60" aria-hidden>
        {icon ?? "✨"}
      </div>
      <h2 className="mt-4 text-base font-semibold text-ink-100">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">{description}</p>
      ) : null}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-amber-400 disabled:opacity-50"
            >
              {action.label}
            </button>
          ) : null}
          {secondary ? (
            <button
              type="button"
              onClick={secondary.onClick}
              className="rounded-md border border-ink-600 bg-ink-900 px-4 py-1.5 text-sm text-ink-200 hover:bg-ink-700"
            >
              {secondary.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
