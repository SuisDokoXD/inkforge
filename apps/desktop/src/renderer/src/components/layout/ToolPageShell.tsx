import type { ReactNode } from "react";
import { Button } from "../ui";

interface ToolPageShellProps {
  title: string;
  description: string;
  action?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}

/** Shared content-level frame for feature pages: object toolbar, optional resource rail, and a scrollable work surface. */
export function ToolPageShell({ title, description, action, sidebar, children }: ToolPageShellProps): JSX.Element {
  return (
    <div className="tool-page-shell flex h-full min-h-0 w-full overflow-hidden bg-ink-900">
      {sidebar ? <aside className="tool-page-rail min-h-0 shrink-0 border-r border-ink-700 bg-ink-800/30">{sidebar}</aside> : null}
      <section className="tool-page-main flex min-w-0 min-h-0 flex-1 flex-col">
        <header className="tool-page-toolbar flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-800/55 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink-100">{title}</h2>
            <p className="mt-1 truncate text-xs text-ink-500">{description}</p>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
        <main className="tool-page-content min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="tool-page-content-inner">{children}</div>
        </main>
      </section>
    </div>
  );
}
