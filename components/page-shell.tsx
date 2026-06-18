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
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        <span className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-ink-dim">
          Coming in {phase}
        </span>
      </div>
      {first && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)" }}>
          <span className="font-medium text-accent">What to look at first — </span>
          <span className="text-ink-dim">{first}</span>
        </div>
      )}
      {children && <div className="text-ink-dim">{children}</div>}
    </div>
  );
}
