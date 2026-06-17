"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, Quote } from "@/lib/providers/types";
import type { Holding } from "@/lib/db";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(`/api/quote?symbol=${s}`);
        return [s, (await r.json()) as DataResult<Quote>] as const;
      } catch {
        return [s, { data: null, source: "unavailable", asOf: null, provider: "client", note: "failed" } as DataResult<Quote>] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function HoldingsManager() {
  const { data: holdings = [], mutate } = useSWR<Holding[]>("/api/holdings", fetchJson, {
    revalidateOnFocus: true,
  });

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [note, setNote] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const symbols = holdings.map((h) => h.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["holdings-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );

  async function addHolding() {
    const sym = symbol.trim().toUpperCase();
    const sh = Number(shares);
    const cost = Number(avgCost);
    if (!sym || !Number.isFinite(sh) || sh <= 0) return;
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, shares: sh, avgCost: Number.isFinite(cost) ? cost : 0, note: note.trim() || undefined, source: "manual" }),
    });
    setSymbol(""); setShares(""); setAvgCost(""); setNote("");
    mutate();
  }

  async function removeHolding(id: string) {
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    mutate();
  }

  async function syncFromEtrade() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/etrade/positions");
      if (r.status === 401) { setSyncMsg("E*TRADE session expired — go to Connectors and reconnect."); return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); setSyncMsg((j as any).error ?? "Sync failed."); return; }
      const { holdings: synced, accountName, syncedAt, equityPositions } = await r.json() as {
        holdings: { symbol: string; shares: number; avgCost: number; note?: string }[];
        accountName: string; syncedAt: string; equityPositions: number;
      };
      await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true, holdings: synced.map((h) => ({ ...h, source: "etrade" })) }),
      });
      mutate();
      setSyncMsg(`Synced ${equityPositions} position${equityPositions !== 1 ? "s" : ""} from ${accountName}. ${new Date(syncedAt).toLocaleTimeString()}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync error");
    } finally {
      setSyncing(false);
    }
  }

  const valued = holdings.map((h) => {
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

  const inputCls = "rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* E*TRADE sync */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-4 py-3">
        <button onClick={syncFromEtrade} disabled={syncing}
          className="rounded-md border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-50">
          {syncing ? "Syncing…" : "↓ Sync from E*TRADE"}
        </button>
        {syncMsg && (
          <span className={`text-sm ${syncMsg.includes("expired") || syncMsg.includes("failed") ? "text-rose-400" : "text-slate-400"}`}>
            {syncMsg}
            {syncMsg.includes("Connectors") && <a href="/connectors" className="ml-1 text-brand-400 underline">Go to Connectors</a>}
          </span>
        )}
        {!syncMsg && <span className="text-xs text-slate-600">Connect E*TRADE in Connectors first, then sync here.</span>}
      </div>

      {/* Add form */}
      <div className="rounded-xl glass p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addHolding()} placeholder="Ticker (e.g. AAPL)" className={inputCls} />
          <input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" inputMode="decimal" className={inputCls} />
          <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="Avg cost $" inputMode="decimal" className={inputCls} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <button onClick={addHolding} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            Add holding
          </button>
        </div>
      </div>

      {holdings.length === 0 && (
        <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-sm text-slate-500">
          No holdings yet. Add a ticker above or sync from E*TRADE.
        </div>
      )}

      {holdings.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">
              Portfolio value: <span className="text-slate-100">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
            {anySource && <DataBadge source={anySource} />}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/25 text-xs uppercase tracking-wide text-slate-500">
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
              <tbody className="divide-y divide-white/5">
                {valued.map(({ h, price, value, gain, gainPct }) => {
                  const up = (gain ?? 0) >= 0;
                  const weight = value != null && total > 0 ? (value / total) * 100 : null;
                  return (
                    <tr key={h.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/holdings/${h.symbol}`} className="text-brand-400 hover:underline">{h.symbol}</Link>
                        {h.source === "etrade" && <span className="ml-1 text-[10px] text-slate-600">E*T</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{h.shares}</td>
                      <td className="px-3 py-2 text-slate-400">${h.avgCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-300">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</td>
                      <td className={`px-3 py-2 ${gain == null ? "text-slate-500" : up ? "text-emerald-400" : "text-rose-400"}`}>
                        {gain == null ? "—" : `${up ? "▲" : "▼"} $${Math.abs(gain).toFixed(0)} (${gainPct?.toFixed(1)}%) ${up ? "up" : "down"}`}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{weight != null ? `${weight.toFixed(1)}%` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeHolding(h.id)} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
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
        Saved to <code>data/db.json</code> — persists across restarts, independent of browser cache. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
