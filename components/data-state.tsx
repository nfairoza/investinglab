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

// Always shown next to any market figure or chart.
export function DataTimestamp({ asOf }: { asOf: string | null }) {
  return (
    <span className="text-[11px] text-ink-faint">
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
