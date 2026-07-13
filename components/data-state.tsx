"use client";

import type { DataSource } from "@/lib/providers/types";
import { useIsAdmin } from "./use-is-admin";

// LIVE / DEMO / Live-data-unavailable badge. Meaning is carried by WORD + color
// (+ a dot), never color alone — colorblind-safe + beginner-friendly. Colors use
// theme tokens so both light and dark stay AA-legible.
//
// User-facing rule: regular users should NOT see the alarming red "Unavailable"
// badge — it's an operational detail. We hide it for them (admins still see it).
export function DataBadge({ source }: { source: DataSource }) {
  const isAdmin = useIsAdmin();
  // Hide the "Unavailable" badge from non-admin users entirely.
  if (source === "unavailable" && !isAdmin) return null;

  const styles: Record<DataSource, React.CSSProperties> = {
    live: { borderColor: "var(--positive)", background: "var(--positive-soft)", color: "var(--positive)" },
    demo: { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" },
    unavailable: { borderColor: "var(--negative)", background: "var(--negative-soft)", color: "var(--negative)" },
  };
  const label =
    source === "live" ? "LIVE" : source === "demo" ? "DEMO" : "Unavailable";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={styles[source]}
      title={source === "unavailable" ? "Live data unavailable" : undefined}
    >
      {source === "live" && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--positive)" }} aria-hidden />
      )}
      {label}
    </span>
  );
}

// Always shown next to any market figure or chart. When `revalidating` is true
// (cached data is showing while a background refresh runs), a tiny spinner appears
// next to the timestamp — the subtle "we're checking for fresher data" affordance
// (S2), never a skeleton over real data.
export function DataTimestamp({ asOf, revalidating = false }: { asOf: string | null; revalidating?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
      {revalidating && (
        <span
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent opacity-60"
          role="status"
          aria-label="Refreshing"
        />
      )}
      Data as of {asOf ? new Date(asOf).toLocaleString() : "—"}
    </span>
  );
}

// Friendly note for an unavailable/error state. For regular users we replace any
// raw API/AI error (FMP quota, Gemini 429, etc.) with a calm generic message;
// admins see the real text to diagnose. Use this anywhere a `note` from a data
// result would otherwise be rendered to the user.
export function DataNote({ note, fallback, className = "" }: { note?: string | null; fallback?: string; className?: string }) {
  const isAdmin = useIsAdmin();
  const text = isAdmin ? (note ?? fallback ?? "") : (note ? friendlyMessage(note) : (fallback ?? friendlyMessage(null)));
  if (!text) return null;
  return <span className={className}>{text}</span>;
}

// Inline error chip with an optional retry. Regular users see a calm message;
// admins see the real error text to diagnose. (Skeleton + EmptyState live in
// components/ui/primitives.tsx — reuse those for loading/empty states.)
export function ErrorState({ error, onRetry, className = "" }: { error: unknown; onRetry?: () => void; className?: string }) {
  const isAdmin = useIsAdmin();
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const text = isAdmin ? (raw ?? "Something went wrong.") : friendlyMessage(raw);
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300 ${className}`}>
      <span>{text}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 rounded border border-rose-500/40 px-2 py-0.5 text-xs hover:bg-rose-500/10">
          Retry
        </button>
      )}
    </div>
  );
}

// Map a raw error/note to a calm user-facing message. Exported so other places
// (toasts, inline errors) can reuse the same wording.
export function friendlyMessage(raw?: string | null): string {
  if (!raw) return "This isn’t available right now. Please try again shortly.";
  // Anything that smells like a quota/billing/auth/provider error → generic.
  if (/quota|limit|429|credit|billing|api key|unauthorized|forbidden|http \d|error|exceeded|plan/i.test(raw)) {
    return "This isn’t available right now. If it keeps happening, please report it to your administrator.";
  }
  return raw;
}
