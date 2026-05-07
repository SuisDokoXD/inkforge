// M9 · Phase 2.1 · 路由切换时的统一占位骨架。
export function PageSkeleton(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-6" aria-busy="true" aria-live="polite">
      <div className="h-6 w-40 animate-pulse rounded bg-ink-700/50" />
      <div className="h-4 w-72 animate-pulse rounded bg-ink-700/40" />
      <div className="mt-4 grid flex-1 grid-cols-3 gap-3">
        <div className="animate-pulse rounded-lg bg-ink-700/30" />
        <div className="animate-pulse rounded-lg bg-ink-700/30" />
        <div className="animate-pulse rounded-lg bg-ink-700/30" />
      </div>
    </div>
  );
}
