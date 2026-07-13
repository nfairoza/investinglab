"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchJson } from "@/lib/fetch-json";
import { PriceChart } from "@/components/charts/PriceChart";
import { buildMarkers, type TradeForMarker } from "./chart-markers";

// PT2 — the research-page price chart with an optional "Power activity" overlay:
// buy/sell markers for ALL tracked people's trades on this symbol. Off by
// default (a toggle); markers + data come from already-synced trades + cached
// price history, so flipping it on costs zero API calls.
export function PowerActivityChart({ symbol }: { symbol: string }) {
  const [on, setOn] = useState(false);
  // Only fetch trades once the overlay is switched on.
  const { data } = useSWR<{ rows: TradeForMarker[] }>(
    on ? `/api/power-trades/trades?q=${encodeURIComponent(symbol)}&window=1y&limit=500` : null,
    fetchJson,
    { revalidateOnFocus: false },
  );
  // The q filter is broad (person/ticker/asset); keep only exact-ticker buys/sells.
  const markers = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r: any) => String(r.ticker ?? "").toUpperCase() === symbol.toUpperCase());
    return buildMarkers(rows);
  }, [data, symbol]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-dim">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-brand-500" />
          Power activity overlay
        </label>
        {on && (
          <div className="flex items-center gap-3 text-[11px] text-ink-faint">
            <span className="inline-flex items-center gap-1"><span className="text-emerald-400">▲</span> buy</span>
            <span className="inline-flex items-center gap-1"><span className="text-rose-400">▼</span> sell</span>
            <span>{markers.length} tracked trade{markers.length === 1 ? "" : "s"} · 1y</span>
          </div>
        )}
      </div>
      <PriceChart symbol={symbol} markers={on ? markers : undefined} />
      {on && markers.length === 0 && (
        <p className="text-[11px] text-ink-faint">No tracked buys/sells on {symbol} in the last year. Markers appear once a disclosed congressional or insider trade on this name is synced.</p>
      )}
    </div>
  );
}
