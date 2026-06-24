"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SlidersHorizontal, RefreshCw } from "lucide-react";
import { DataBadge } from "./data-state";
import type { DataResult, ScreenerRow } from "@/lib/providers/types";

const fetchJson = (u: string) => fetch(u).then((r) => r.json() as Promise<DataResult<ScreenerRow[]>>);

// FMP sector vocabulary (from the Available Sectors API). "" = any sector.
const SECTORS = ["", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Consumer Defensive", "Energy", "Industrials", "Basic Materials", "Communication Services", "Utilities", "Real Estate"];

interface Filters {
  marketCapMoreThan: string; priceMoreThan: string; priceLowerThan: string;
  volumeMoreThan: string; betaMoreThan: string; betaLowerThan: string;
  dividendMoreThan: string; sector: string;
}
const EMPTY: Filters = { marketCapMoreThan: "", priceMoreThan: "", priceLowerThan: "", volumeMoreThan: "", betaMoreThan: "", betaLowerThan: "", dividendMoreThan: "", sector: "" };

// Robinhood-style starting points. Each just seeds the filter form.
const PRESETS: { key: string; label: string; f: Partial<Filters> }[] = [
  { key: "large-tech", label: "Large-cap Tech", f: { marketCapMoreThan: "10000000000", sector: "Technology", volumeMoreThan: "1000000" } },
  { key: "dividend", label: "Dividend payers", f: { dividendMoreThan: "1", marketCapMoreThan: "2000000000" } },
  { key: "low-beta", label: "Low volatility", f: { betaLowerThan: "1", marketCapMoreThan: "5000000000" } },
  { key: "high-beta", label: "High momentum", f: { betaMoreThan: "1.5", volumeMoreThan: "2000000" } },
  { key: "affordable", label: "Under $50", f: { priceLowerThan: "50", marketCapMoreThan: "1000000000", volumeMoreThan: "500000" } },
];

function compact(n: number | null): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function Screener() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  // `applied` is the committed filter set the query uses — editing the form does
  // NOT refetch until you press Run, so we don't hammer FMP's quota per keystroke.
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [live, setLive] = useState(false); // opt-in polling (off by default to save quota)

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.marketCapMoreThan) p.set("marketCapMoreThan", applied.marketCapMoreThan);
    if (applied.priceMoreThan) p.set("priceMoreThan", applied.priceMoreThan);
    if (applied.priceLowerThan) p.set("priceLowerThan", applied.priceLowerThan);
    if (applied.volumeMoreThan) p.set("volumeMoreThan", applied.volumeMoreThan);
    if (applied.betaMoreThan) p.set("betaMoreThan", applied.betaMoreThan);
    if (applied.betaLowerThan) p.set("betaLowerThan", applied.betaLowerThan);
    if (applied.dividendMoreThan) p.set("dividendMoreThan", applied.dividendMoreThan);
    if (applied.sector) p.set("sector", applied.sector);
    p.set("isActivelyTrading", "true");
    p.set("limit", "100");
    return p.toString();
  }, [applied]);

  const { data, isLoading, mutate, isValidating } = useSWR(`/api/screener?${qs}`, fetchJson, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    // Opt-in polling. 30s (not 10s): FMP free tier is 250 calls/day, and the
    // server caches 90s anyway, so faster polling would burn quota for no gain.
    refreshInterval: live ? 30_000 : 0,
  });

  const rows = data?.data ?? [];
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  const run = () => setApplied(filters);
  const applyPreset = (f: Partial<Filters>) => { const next = { ...EMPTY, ...f }; setFilters(next); setApplied(next); };
  const reset = () => { setFilters(EMPTY); setApplied(EMPTY); };

  const inputCls = "w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-faint">Presets:</span>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => applyPreset(p.f)}
            className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-dim transition-colors hover:bg-surface hover:text-ink">
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl glass p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><SlidersHorizontal size={15} className="text-brand-400" /> Filters</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-[10px] text-ink-faint">Min market cap ($)<input value={filters.marketCapMoreThan} onChange={set("marketCapMoreThan")} inputMode="numeric" placeholder="e.g. 10000000000" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Min price ($)<input value={filters.priceMoreThan} onChange={set("priceMoreThan")} inputMode="decimal" placeholder="e.g. 5" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Max price ($)<input value={filters.priceLowerThan} onChange={set("priceLowerThan")} inputMode="decimal" placeholder="e.g. 200" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Min volume<input value={filters.volumeMoreThan} onChange={set("volumeMoreThan")} inputMode="numeric" placeholder="e.g. 1000000" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Min beta<input value={filters.betaMoreThan} onChange={set("betaMoreThan")} inputMode="decimal" placeholder="e.g. 0.5" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Max beta<input value={filters.betaLowerThan} onChange={set("betaLowerThan")} inputMode="decimal" placeholder="e.g. 1.5" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Min dividend ($)<input value={filters.dividendMoreThan} onChange={set("dividendMoreThan")} inputMode="decimal" placeholder="e.g. 1" className={`${inputCls} mt-0.5`} /></label>
          <label className="text-[10px] text-ink-faint">Sector
            <select value={filters.sector} onChange={set("sector")} className={`${inputCls} mt-0.5`} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
              {SECTORS.map((s) => <option key={s} value={s}>{s || "Any sector"}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={run} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500">Run screen</button>
          <button onClick={reset} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink">Reset</button>
          <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink">
            <RefreshCw size={12} className={isValidating ? "animate-spin" : ""} /> Refresh
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-dim">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Auto-refresh (30s)
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-dim">{isLoading ? "Screening…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}</div>
        {data && <DataBadge source={data.source} />}
      </div>

      {data?.source === "unavailable" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          Screener unavailable{data.note ? `: ${data.note}` : ""}.
        </div>
      )}

      {data && data.source !== "unavailable" && rows.length === 0 && !isLoading && (
        <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">
          No stocks match these filters. Loosen a constraint or try a preset.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Day %</th>
                <th className="px-3 py-2 text-right">Mkt cap</th>
                <th className="px-3 py-2 text-right">Volume</th>
                <th className="px-3 py-2 text-right">Beta</th>
                <th className="px-3 py-2">Sector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.symbol} className="hover:bg-surface">
                  <td className="px-3 py-2"><Link href={`/research?symbol=${r.symbol}`} className="font-semibold text-brand-300 hover:underline">{r.symbol}</Link></td>
                  <td className="px-3 py-2 max-w-[16rem] truncate text-ink-dim">{r.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                  <td className={`px-3 py-2 text-right ${r.changePct == null ? "text-ink-faint" : r.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {r.changePct == null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-dim">{compact(r.marketCap)}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{compact(r.volume)}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{r.beta != null ? r.beta.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{r.sector ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Data via Financial Modeling Prep, cached ~90s. Auto-refresh polls every 30s while enabled —
        kept modest to respect API quota. Research data, not a recommendation.
      </p>
    </div>
  );
}
