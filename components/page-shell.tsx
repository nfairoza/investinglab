// Placeholder shell for pages that get built out in later phases.
// Keeps the "What should I look at first?" beginner callout consistent everywhere.
export function PageShell({
  title,
  phase,
  first,
  children,
}: {
  title: string;
  phase: string;
  first?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-ink-dim">
          Scaffolded — build in {phase}
        </span>
      </div>
      {first && (
        <div className="mt-5 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-brand-100">
          <span className="font-semibold">What should I look at first?</span> {first}
        </div>
      )}
      <div className="mt-6 text-ink-dim">{children}</div>
    </div>
  );
}
