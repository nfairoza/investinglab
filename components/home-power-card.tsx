"use client";

import useSWR from "swr";
import Link from "next/link";
import { Landmark, ChevronRight } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface TradeRow {
  person_name?: string | null;
  ticker?: string | null;
  asset_name?: string | null;
  transaction_type?: string | null;
  amount_range?: string | null;
  disclosure_date?: string | null;
  transaction_date?: string | null;
}

function daysAgo(d?: string | null): string {
  if (!d) return "";
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return "";
  const n = Math.max(0, Math.round((Date.now() - t) / 86400000));
  return n === 0 ? "today" : n === 1 ? "1d ago" : `${n}d ago`;
}

// Home discovery card for Power Trades: shows the latest notable disclosure as a
// real teaser ("Rep. X bought NVDA · 3d ago"), not a label. Skeleton → real data;
// renders nothing only if Power Trades isn't configured / has no rows.
export function HomePowerCard() {
  const { data, isLoading } = useSWR<{ rows?: TradeRow[]; note?: string }>(
    "/api/power-trades/trades?window=90d&limit=1",
    fetchJson,
    { revalidateOnFocus: false },
  );
  const row = data?.rows?.[0];

  if (isLoading) {
    return (
      <div className="rounded-2xl glass p-5">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton mt-3 h-5 w-3/4 rounded" />
      </div>
    );
  }
  if (!row) return null; // not configured or no data — stay quiet, don't show a blank

  const who = row.person_name ?? "A public official";
  const verb = (row.transaction_type ?? "").toLowerCase().includes("sale") ? "sold" : "bought";
  const what = row.ticker || row.asset_name || "a position";
  const amt = row.amount_range ? ` (${row.amount_range})` : "";
  const when = daysAgo(row.disclosure_date ?? row.transaction_date);

  return (
    <Link href="/power-trades" className="card-hover group block rounded-2xl glass p-5 transition-transform active:scale-[0.99]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Landmark size={15} className="text-rose-400" /> Power Trades
        </div>
        <ChevronRight size={16} className="text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        <span className="font-medium text-ink">{who}</span> {verb}{" "}
        {row.ticker ? <span className="font-mono text-brand-300">{row.ticker}</span> : what}{amt}
        {when && <span className="text-ink-faint"> · {when}</span>}
      </p>
    </Link>
  );
}
