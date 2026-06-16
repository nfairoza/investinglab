"use client";

import { useState } from "react";
import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, Quote } from "@/lib/providers/types";
import type { WatchItem } from "@/lib/db";

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

export function WatchlistManager() {
  const { data: items = [], mutate } = useSWR<WatchItem[]>("/api/watchlist", fetchJson, {
    revalidateOnFocus: true,
  });

  const [symbol, setSymbol] = useState("");
  const [idealBuy, setIdealBuy] = useState("");
  const [note, setNote] = useState("");

  const symbols = items.map((w) => w.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["watch-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );

  async function addItem() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const target = Number(idealBuy);
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: sym,
        idealBuy: Number.isFinite(target) && target > 0 ? target : undefined,
        note: note.trim() || undefined,
      }),
    });
    setSymbol(""); setIdealBuy(""); setNote("");
    mutate();
  }

  async function removeItem(id: string) {
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    mutate();
  }

  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;
  const inputCls = "rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Ticker (e.g. NVDA)" className={inputCls} />
          <input value={idealBuy} onChange={(e) => setIdealBuy(e.target.value)} placeholder="Ideal buy $ (optional)" inputMode="decimal" className={inputCls} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <button onClick={addItem} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            Add to watchlist
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
          Nothing on your watchlist yet. Add a ticker you&apos;re considering above.
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center gap-2">{anySource && <DataBadge source={anySource} />}</div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Ideal buy</th>
                  <th className="px-3 py-2">Vs. target</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((w) => {
                  const price = quotes?.[w.symbol]?.data?.price ?? null;
                  const atOrBelow = price != null && w.idealBuy != null ? price <= w.idealBuy : null;
                  return (
                    <tr key={w.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-medium text-brand-400">{w.symbol}</td>
                      <td className="px-3 py-2 text-slate-300">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-slate-400">{w.idealBuy != null ? `$${w.idealBuy.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2">
                        {atOrBelow == null ? <span className="text-slate-500">—</span>
                          : atOrBelow ? <span className="text-emerald-400">● at/below target</span>
                          : <span className="text-slate-400">above target</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{w.note ?? ""}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeItem(w.id)} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
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
        Saved to <code>data/db.json</code> — persists across restarts. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
