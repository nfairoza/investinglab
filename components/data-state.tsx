import type { DataSource } from "@/lib/providers/types";

// LIVE / DEMO / Live-data-unavailable badge. Meaning is carried by WORD + color,
// never color alone (a colorblind-safe and beginner-friendly requirement).
export function DataBadge({ source }: { source: DataSource }) {
  const styles: Record<DataSource, string> = {
    live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    demo: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    unavailable: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  };
  const label =
    source === "live" ? "● LIVE" : source === "demo" ? "DEMO" : "Live data unavailable";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[source]}`}>
      {label}
    </span>
  );
}

// Always shown next to any market figure or chart.
export function DataTimestamp({ asOf }: { asOf: string | null }) {
  return (
    <span className="text-[11px] text-slate-500">
      Data as of {asOf ? new Date(asOf).toLocaleString() : "—"}
    </span>
  );
}
