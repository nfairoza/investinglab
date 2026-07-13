"use client";

import { useMemo, useState } from "react";
import { PriceChart } from "@/components/charts/PriceChart";
import { buildMarkers, type TradeForMarker } from "./chart-markers";

// PT2 — a person's own trades plotted on each ticker they've traded. Top 5 by
// disclosed trade volume (count), expandable to the rest. Reuses the already-
// fetched trade list + cached price history; zero new API cost.
interface PersonTrade extends TradeForMarker {
  ticker?: string | null;
}

export function PersonActivityCharts({ trades }: { trades: PersonTrade[] }) {
  const [expanded, setExpanded] = useState(false);

  const byTicker = useMemo(() => {
    const m = new Map<string, PersonTrade[]>();
    for (const t of trades) {
      const tk = (t.ticker ?? "").toUpperCase();
      if (!tk) continue;
      if (t.transaction_type !== "buy" && t.transaction_type !== "sell") continue;
      (m.get(tk) ?? m.set(tk, []).get(tk)!).push(t);
    }
    return Array.from(m.entries())
      .map(([ticker, ts]) => ({ ticker, trades: ts, count: ts.length }))
      .sort((a, b) => b.count - a.count);
  }, [trades]);

  if (byTicker.length === 0) return null;
  const shown = expanded ? byTicker : byTicker.slice(0, 5);

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Trade markers on price ({byTicker.length} ticker{byTicker.length === 1 ? "" : "s"})
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {shown.map((g) => (
          <div key={g.ticker}>
            <div className="mb-1 text-xs text-ink-dim">{g.ticker} · {g.count} trade{g.count === 1 ? "" : "s"}</div>
            <PriceChart symbol={g.ticker} markers={buildMarkers(g.trades)} />
          </div>
        ))}
      </div>
      {byTicker.length > 5 && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-2 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-dim hover:bg-surface hover:text-ink">
          {expanded ? "Show top 5 only" : `Show all ${byTicker.length} tickers`}
        </button>
      )}
    </div>
  );
}
