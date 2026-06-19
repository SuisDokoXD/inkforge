type PageSkeletonProps = {
  label?: string;
};

function SkeletonBlock({ className }: { className: string }): JSX.Element {
  return <div className={`skeleton-shimmer ${className}`} aria-hidden="true" />;
}

export function PageSkeleton({ label = "Loading" }: PageSkeletonProps): JSX.Element {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col gap-4 p-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>

      <header className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <SkeletonBlock className="h-6 w-44 rounded-md bg-ink-700/60" />
          <SkeletonBlock className="h-3.5 w-72 max-w-[70vw] rounded bg-ink-700/35" />
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <SkeletonBlock className="h-8 w-8 rounded-md bg-ink-700/45" />
          <SkeletonBlock className="h-8 w-8 rounded-md bg-ink-700/35" />
          <SkeletonBlock className="h-8 w-20 rounded-md bg-accent-700/30" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_17rem]">
        <aside className="hidden min-h-0 flex-col gap-3 rounded-lg border border-ink-700/60 bg-ink-800/40 p-3 lg:flex">
          <SkeletonBlock className="h-8 w-32 rounded-md bg-ink-700/45" />
          <div className="space-y-2">
            {["w-11/12", "w-4/5", "w-full", "w-3/4", "w-10/12", "w-2/3"].map((width) => (
              <SkeletonBlock key={width} className={`h-10 ${width} rounded-md bg-ink-700/35`} />
            ))}
          </div>
        </aside>

        <main className="min-h-0 rounded-lg border border-ink-700/60 bg-ink-800/35 p-4">
          <div className="flex h-full min-h-[22rem] flex-col gap-4">
            <div className="hidden grid-cols-3 gap-3 md:grid">
              <SkeletonBlock className="h-20 rounded-lg bg-ink-700/35" />
              <SkeletonBlock className="h-20 rounded-lg bg-ink-700/30" />
              <SkeletonBlock className="h-20 rounded-lg bg-ink-700/25" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-md bg-ink-900/25 p-4 ring-1 ring-ink-700/40">
              <SkeletonBlock className="h-4 w-2/3 rounded bg-ink-700/45" />
              <SkeletonBlock className="h-4 w-11/12 rounded bg-ink-700/30" />
              <SkeletonBlock className="h-4 w-10/12 rounded bg-ink-700/30" />
              <SkeletonBlock className="h-4 w-4/5 rounded bg-ink-700/25" />
              <div className="mt-3 grid flex-1 grid-cols-2 gap-3">
                <SkeletonBlock className="min-h-28 rounded-lg bg-ink-700/25" />
                <SkeletonBlock className="min-h-28 rounded-lg bg-ink-700/20" />
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden min-h-0 flex-col gap-3 rounded-lg border border-ink-700/60 bg-ink-800/40 p-3 xl:flex">
          <SkeletonBlock className="h-8 w-28 rounded-md bg-ink-700/45" />
          <SkeletonBlock className="h-24 rounded-lg bg-ink-700/30" />
          <SkeletonBlock className="h-16 rounded-lg bg-ink-700/25" />
          <SkeletonBlock className="h-16 rounded-lg bg-ink-700/25" />
        </aside>
      </div>
    </div>
  );
}
