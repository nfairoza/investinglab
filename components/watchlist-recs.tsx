"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Sparkles, Plus } from "lucide-react";
import { AddToList } from "./add-to-list";

// "You might like" — AI watchlist recommendations from holdings + watch lists +
// recently-viewed. Auto-refreshes at most once / 24h server-side; NO refresh
// button (token control). Renders nothing if there are no recs.
interface Rec { symbol: string; name: string | null; reason: string }
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

export function WatchlistRecs() {
  const { data } = useSWR<{ recs: Rec[] }>("/api/watchlist-recs", fetchJson, { revalidateOnFocus: false });
  const [addSymbol, setAddSymbol] = useState<string | null>(null);
  const recs = data?.recs ?? [];
  if (recs.length === 0) return null;

  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Sparkles size={15} className="text-brand-400" /> You might like
      </div>
      <div className="space-y-1.5">
        {recs.map((r) => (
          <div key={r.symbol} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
            <Link href={`/research?symbol=${r.symbol}`} className="w-14 shrink-0 font-mono font-semibold text-brand-300 hover:underline">{r.symbol}</Link>
            <span className="min-w-0 flex-1">
              {r.name && <span className="block truncate text-xs text-ink">{r.name}</span>}
              <span className="block truncate text-[11px] text-ink-faint">{r.reason}</span>
            </span>
            <button onClick={() => setAddSymbol(r.symbol)} title={`Add ${r.symbol} to a list`} className="shrink-0 rounded-md p-1 text-ink-faint hover:bg-surface-raised hover:text-brand-300"><Plus size={15} /></button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">Ideas based on your holdings, lists & recent views — not financial advice.</p>
      {addSymbol && <AddToList symbol={addSymbol} onClose={() => setAddSymbol(null)} />}
    </div>
  );
}
