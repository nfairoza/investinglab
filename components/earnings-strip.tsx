"use client";

import useSWR from "swr";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { formatEarnings, type EarningsEvent } from "@/lib/earnings/calendar";

// F3 — upcoming-earnings strip for the Portfolio page: the next 14 days of
// earnings across held symbols. Renders nothing when there are none (never a
// placeholder). Each chip links to the ticker's research.
export function EarningsStrip() {
  const { data } = useSWR<{ upcoming: EarningsEvent[] }>("/api/earnings", fetchJson, { revalidateOnFocus: false });
  const upcoming = data?.upcoming ?? [];
  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        <CalendarClock size={12} className="text-brand-400" /> Earnings — next 14 days
      </div>
      <div className="flex flex-wrap gap-2">
        {upcoming.map((e) => (
          <Link key={e.symbol} href={`/research?ticker=${e.symbol}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-ink-dim transition-colors hover:text-ink">
            <span className="font-semibold text-ink">{e.symbol}</span>
            <span className="text-ink-faint">{formatEarnings(e)?.replace("Earnings ", "")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
