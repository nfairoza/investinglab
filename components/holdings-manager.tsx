"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, Quote } from "@/lib/providers/types";
import { useLocalList, newId, type Holding } from "@/lib/local-store";

// Fetch quotes for many symbols at once. Returns a map symbol -> DataResult.
async function fetchQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(`/api/quote?symbol=${s}`);
        return [s, (await r.json()) as DataResult<Quote>] as const;
      } catch {
        return [
          s,
          { data: null, source: "unavailable", asOf: null, provider: "client", note: "failed" } as DataResult<Quote>,
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function HoldingsManager() {
  const { items, ready, add, remove } = useLocalList<Holding>("stockpilot.holdings");
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [note, setNote] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function syncFromEtrade() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/etrade/positions");
      if (r.status === 401) {
        setSyncMsg("E*TRADE session expired — go to Connectors and click Reconnect.");
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setSyncMsg((j as any).error ?? "Sync failed.");
        return;
      }
      const { holdings: synced, accountName, syncedAt, equityPositions } = await r.json() as {
        holdings: Holding[]; accountName: string; syncedAt: string; equityPositions: number;
      };
      // Merge: replace any existing E*TRADE-synced entries, add new ones.
      // Manual entries (no "Synced from E*TRADE" note) are left untouched.
      for (const h of synced) {
        const existing = items.find((i) => i.symbol === h.symbol);
        if (!existing) {
          add(h);
        }
        // If it already exists (manual or prior sync) we don't overwrite —
        // the user's manual entry takes precedence. They can remove and re-sync.
      }
      const newCount = synced.filter((h) => !items.find((i) => i.symbol === h.symbol)).length;
      setSyncMsg(`Synced ${equityPositions} position${equityPositions !== 1 ? "s" : ""} from ${accountName}. ${newCount} new added. ${new Date(syncedAt).toLocaleTimeString()}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync error");
    } finally {
      setSyncing(false);
    }
  }

  const symbols = items.map((h) => h.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["holdings-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );

  function addHolding() {
    const sym = symbol.trim().toUpperCase();
    const sh = Number(shares);
    const cost = Number(avgCost);
    if (!sym || !Number.isFinite(sh) || sh <= 0) return;
    add({ id: newId(), symbol: sym, shares: sh, avgCost: Number.isFinite(cost) ? cost : 0, note: note.trim() || undefined });
    setSymbol("");
    setShares("");
    setAvgCost("");
    setNote("");
  }

  // Portfolio total (only from holdings with a live/demo price).
  const valued = items.map((h) => {
    const q = quotes?.[h.symbol]?.data ?? null;
    const price = q?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gain = value != null ? value - cost : null;
    const gainPct = value != null && cost > 0 ? (gain! / cost) * 100 : null;
    return { h, price, value, gain, gainPct };
  });
  const total = valued.reduce((sum, v) => sum + (v.value ?? 0), 0);
  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;

  return (
    <div className="space-y-4">
      {/* E*TRADE sync */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3">
        <button
          onClick={syncFromEtrade}
          disabled={syncing}
          className="rounded-md border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "↓ Sync from E*TRADE"}
        </button>
        {syncMsg && (
          <span className={`text-sm ${syncMsg.includes("expired") || syncMsg.includes("failed") || syncMsg.includes("error") ? "text-rose-400" : "text-slate-400"}`}>
            {syncMsg}
            {(syncMsg.includes("expired") || syncMsg.includes("Reconnect")) && (
              <a href="/connectors" className="ml-1 text-brand-400 underline">Go to Connectors</a>
            )}
          </span>
        )}
        {!syncMsg && <span className="text-xs text-slate-600">Connect E*TRADE in the Connectors tab first, then sync your real positions here.</span>}
      </div>

      {/* Add form */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Ticker (e.g. AAPL)"
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none" />
          <input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" inputMode="decimal"
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none" />
          <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="Avg cost $" inputMode="decimal"
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none" />
          <button onClick={addHolding} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            Add holding
          </button>
        </div>
      </div>

      {ready && items.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
          No holdings yet. Add a ticker and how many shares you own above.
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">
              Portfolio value: <span className="text-slate-100">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </span>
            {anySource && <DataBadge source={anySource} />}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Shares</th>
                  <th className="px-3 py-2">Avg cost</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Gain/loss</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {valued.map(({ h, price, value, gain, gainPct }) => {
                  const up = (gain ?? 0) >= 0;
                  const weight = value != null && total > 0 ? (value / total) * 100 : null;
                  return (
                    <tr key={h.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-medium text-slate-200">
                        <Link href={`/holdings/${h.symbol}`} className="text-brand-300 hover:underline">{h.symbol}</Link>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{h.shares}</td>
                      <td className="px-3 py-2 text-slate-400">${h.avgCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-300">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</td>
                      <td className={`px-3 py-2 ${gain == null ? "text-slate-500" : up ? "text-emerald-400" : "text-rose-400"}`}>
                        {gain == null ? "—" : `${up ? "▲" : "▼"} $${Math.abs(gain).toFixed(2)} (${gainPct?.toFixed(1)}%) ${up ? "up" : "down"}`}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{weight != null ? `${weight.toFixed(1)}%` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => remove(h.id)} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {quotes && <DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} />}
        </>
      )}

      <p className="text-[11px] text-slate-600">
        Saved in your browser for now; moves to your account once sign-in is wired. Research and
        educational analysis, not financial advice.
      </p>
    </div>
  );
}
