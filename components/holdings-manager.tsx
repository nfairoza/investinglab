"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import { TickerInput } from "./ticker-input";
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
  const { data: allHoldings = [], mutate } = useSWR<Holding[]>("/api/holdings", fetchJson, {
    revalidateOnFocus: true,
  });

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [note, setNote] = useState("");
  const [syncingEtrade, setSyncingEtrade] = useState(false);
  const [syncingRobinhood, setSyncingRobinhood] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "etrade" | "robinhood">("all");

  // Which sources actually exist in the data (for showing only relevant chips).
  const presentSources = Array.from(new Set(allHoldings.map((h) => h.source ?? "manual")));
  const holdings = sourceFilter === "all"
    ? allHoldings
    : allHoldings.filter((h) => (h.source ?? "manual") === sourceFilter);

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
    setSyncingEtrade(true);
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
      setSyncingEtrade(false);
    }
  }

  async function syncFromRobinhood() {
    setSyncingRobinhood(true);
    setSyncMsg(null);
    try {
      // Crypto (official API) + stocks (unofficial) — sync whichever is connected.
      const [c, s] = await Promise.all([
        fetch("/api/robinhood/crypto-sync").then((r) => r.json()).catch(() => ({})),
        fetch("/api/robinhood/stocks-sync").then((r) => r.json()).catch(() => ({})),
      ]);
      mutate();
      const parts: string[] = [];
      if (typeof c.imported === "number") parts.push(`${c.imported} crypto`);
      if (typeof s.imported === "number") parts.push(`${s.imported} stocks`);
      if (parts.length) setSyncMsg(`Synced from Robinhood: ${parts.join(" + ")}.`);
      else setSyncMsg(c.error || s.error || "Nothing synced — connect Robinhood in Connectors.");
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync error");
    } finally {
      setSyncingRobinhood(false);
    }
  }

  const valued = holdings.map((h) => {
    const q = quotes?.[h.symbol]?.data ?? null;
    const price = q?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    // Prefer E*TRADE's own total gain when present; otherwise compute from cost.
    const hasCost = h.avgCost > 0 && cost > 0;
    const totalGain = h.totalGain ?? (value != null && hasCost ? value - cost : null);
    const totalGainPct = h.totalGainPct ?? (totalGain != null && cost > 0 ? (totalGain / cost) * 100 : null);
    // Day's gain — only E*TRADE provides this (snapshotted at sync).
    const daysGain = h.daysGain ?? null;
    const daysGainPct = h.daysGainPct ?? (q?.changePct ?? null); // FMP day % as fallback
    return { h, price, value, totalGain, totalGainPct, daysGain, daysGainPct };
  });
  const total = valued.reduce((sum, v) => sum + (v.value ?? 0), 0);
  // Portfolio-level day & total gain (sum of available per-position figures).
  const portDaysGain = valued.reduce((s, v) => s + (v.daysGain ?? 0), 0);
  const portTotalGain = valued.reduce((s, v) => s + (v.totalGain ?? 0), 0);
  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;

  const inputCls = "rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Broker sync */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-4 py-3">
        <button onClick={syncFromEtrade} disabled={syncingEtrade}
          className="rounded-md border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-50">
          {syncingEtrade ? "Syncing…" : "↓ Sync from E*TRADE"}
        </button>
        <button onClick={syncFromRobinhood} disabled={syncingRobinhood}
          className="rounded-md border border-lime-600/60 bg-lime-600/10 px-3 py-1.5 text-sm font-medium text-lime-300 hover:bg-lime-600/20 disabled:opacity-50">
          {syncingRobinhood ? "Syncing…" : "↓ Sync from Robinhood"}
        </button>
        {syncMsg && (
          <span className={`text-sm ${syncMsg.includes("expired") || syncMsg.includes("failed") || syncMsg.includes("Connect") ? "text-rose-400" : "text-slate-400"}`}>
            {syncMsg}
            {syncMsg.includes("Connectors") && <a href="/connectors" className="ml-1 text-brand-400 underline">Go to Connectors</a>}
          </span>
        )}
        {!syncMsg && <span className="text-xs text-slate-600">Connect a broker in Connectors first, then sync here.</span>}
      </div>

      {/* Add form */}
      <div className="rounded-xl glass p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <TickerInput value={symbol} onChange={setSymbol} onSelect={setSymbol} placeholder="Search ticker…" className={inputCls} />
          <input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" inputMode="decimal" className={inputCls} />
          <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="Avg cost $" inputMode="decimal" className={inputCls} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <button onClick={addHolding} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            Add holding
          </button>
        </div>
      </div>

      {allHoldings.length === 0 && (
        <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-sm text-slate-500">
          No holdings yet. Add a ticker above or sync from E*TRADE.
        </div>
      )}

      {allHoldings.length > 0 && (
        <>
          {/* Portfolio summary: value, day's gain, total gain */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Portfolio value</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-100">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Day&apos;s gain/loss</div>
              <div className={`mt-0.5 text-lg font-semibold ${portDaysGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {portDaysGain >= 0 ? "▲" : "▼"} ${Math.abs(portDaysGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {total - portDaysGain > 0 && (
                  <span className="ml-1 text-sm">({((portDaysGain / (total - portDaysGain)) * 100).toFixed(2)}%)</span>
                )}
              </div>
            </div>
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Total gain/loss</div>
              <div className={`mt-0.5 text-lg font-semibold ${portTotalGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {portTotalGain >= 0 ? "▲" : "▼"} ${Math.abs(portTotalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {total - portTotalGain > 0 && (
                  <span className="ml-1 text-sm">({((portTotalGain / (total - portTotalGain)) * 100).toFixed(1)}%)</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{holdings.length} position{holdings.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              {anySource && <DataBadge source={anySource} />}
              {/* Source filter — only shown when there's more than one source */}
              {presentSources.length > 1 && (
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5">
                  {(["all", ...presentSources] as const).map((src) => {
                    const label = src === "all" ? "All" : src === "etrade" ? "E*TRADE" : src === "robinhood" ? "Robinhood" : "Manual";
                    const active = sourceFilter === src;
                    return (
                      <button
                        key={src}
                        onClick={() => setSourceFilter(src as typeof sourceFilter)}
                        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                          active ? "bg-brand-500/15 text-brand-300" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {holdings.length === 0 && (
            <div className="rounded-lg border border-white/5 bg-black/20 p-4 text-center text-sm text-slate-500">
              No {sourceFilter} holdings.
            </div>
          )}

          {holdings.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/25 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Shares</th>
                  <th className="px-3 py-2">Avg cost</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Day&apos;s gain</th>
                  <th className="px-3 py-2">Total gain</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {valued.map(({ h, price, value, totalGain, totalGainPct, daysGain, daysGainPct }) => {
                  const weight = value != null && total > 0 ? (value / total) * 100 : null;
                  const tUp = (totalGain ?? 0) >= 0;
                  const dUp = (daysGain ?? 0) >= 0;
                  return (
                    <tr key={h.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/holdings/${h.symbol}`} className="text-brand-400 hover:underline">{h.symbol}</Link>
                        {h.source === "etrade" && <span className="ml-1 text-[10px] text-slate-600">E*T</span>}
                        {h.source === "robinhood" && <span className="ml-1 text-[10px] text-slate-600">RH</span>}
                        {h.assetType === "crypto" && <span className="ml-1 rounded bg-lime-500/15 px-1 text-[9px] text-lime-300">CRYPTO</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{h.shares}</td>
                      <td className="px-3 py-2 text-slate-400">{h.avgCost > 0 ? `$${h.avgCost.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</td>
                      {/* Day's gain $ + % */}
                      <td className={`px-3 py-2 ${daysGain == null ? "text-slate-500" : dUp ? "text-emerald-400" : "text-rose-400"}`}>
                        {daysGain == null
                          ? (daysGainPct != null ? `${daysGainPct >= 0 ? "▲" : "▼"} ${Math.abs(daysGainPct).toFixed(2)}%` : "—")
                          : `${dUp ? "▲" : "▼"} $${Math.abs(daysGain).toFixed(0)}${daysGainPct != null ? ` (${Math.abs(daysGainPct).toFixed(2)}%)` : ""}`}
                      </td>
                      {/* Total gain $ + % */}
                      <td className={`px-3 py-2 ${totalGain == null || totalGainPct == null ? "text-slate-500" : tUp ? "text-emerald-400" : "text-rose-400"}`}>
                        {totalGain == null || totalGainPct == null ? "—" : `${tUp ? "▲" : "▼"} $${Math.abs(totalGain).toFixed(0)} (${Math.abs(totalGainPct).toFixed(1)}%)`}
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
          )}
          {quotes && <DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} />}
        </>
      )}

      <p className="text-[11px] text-slate-600">
        Saved to <code>data/db.json</code> — persists across restarts, independent of browser cache. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
