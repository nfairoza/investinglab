import type { DataSource } from "@/lib/providers/types";

// LIVE / DEMO / Live-data-unavailable badge. Meaning is carried by WORD + color
// (+ a dot), never color alone — colorblind-safe + beginner-friendly. Colors use
// theme tokens so both light and dark stay AA-legible.
export function DataBadge({ source }: { source: DataSource }) {
  const styles: Record<DataSource, React.CSSProperties> = {
    live: { borderColor: "var(--positive)", background: "var(--positive-soft)", color: "var(--positive)" },
    demo: { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" },
    unavailable: { borderColor: "var(--negative)", background: "var(--negative-soft)", color: "var(--negative)" },
  };
  const label =
    source === "live" ? "● LIVE" : source === "demo" ? "DEMO" : "Live data unavailable";
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={styles[source]}>
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
