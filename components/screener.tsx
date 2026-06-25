"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SlidersHorizontal, RefreshCw, ChevronDown, Sparkles, TrendingUp, Scale, Coins, Sprout, LayoutGrid, Boxes, Activity, Gem, Flame, type LucideIcon } from "lucide-react";
import { DataBadge } from "./data-state";
import { useIsAdmin } from "./use-is-admin";
import type { DataResult, ScreenerRow, ScreenerFilters } from "@/lib/providers/types";

const fetchJson = (u: string) => fetch(u).then((r) => r.json() as Promise<DataResult<ScreenerRow[]>>);
const fetchJsonRaw = (u: string) => fetch(u).then((r) => r.json());

// FMP sector vocabulary (from the Available Sectors API). "" = any sector.
const SECTORS = ["", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Consumer Defensive", "Energy", "Industrials", "Basic Materials", "Communication Services", "Utilities", "Real Estate"];

interface Filters {
  marketCapMoreThan: string; priceMoreThan: string; priceLowerThan: string;
  volumeMoreThan: string; betaMoreThan: string; betaLowerThan: string;
  dividendMoreThan: string; sector: string;
}
const EMPTY: Filters = { marketCapMoreThan: "", priceMoreThan: "", priceLowerThan: "", volumeMoreThan: "", betaMoreThan: "", betaLowerThan: "", dividendMoreThan: "", sector: "" };

// A preset's numeric ScreenerFilters → the string-based form Filters.
function presetToFilters(f: ScreenerFilters): Filters {
  const s = (n: number | undefined) => (n != null ? String(n) : "");
  return {
    marketCapMoreThan: s(f.marketCapMoreThan), priceMoreThan: s(f.priceMoreThan),
    priceLowerThan: s(f.priceLowerThan), volumeMoreThan: s(f.volumeMoreThan),
    betaMoreThan: s(f.betaMoreThan), betaLowerThan: s(f.betaLowerThan),
    dividendMoreThan: s(f.dividendMoreThan), sector: f.sector ?? "",
  };
}

interface PresetCard { key: string; label: string; blurb: string; category: string; filters: ScreenerFilters; image: string }

// Category accent (icon tint) for the small circular thumbnails — subtle, works
// on the theme's own surface in BOTH light and dark.
const CAT_TINT: Record<string, string> = {
  momentum: "text-emerald-500", value: "text-amber-500", dividend: "text-yellow-500",
  income: "text-lime-500", growth: "text-green-500", sector: "text-sky-500",
  size: "text-violet-500", volatility: "text-rose-500", quality: "text-cyan-500",
  speculative: "text-fuchsia-500",
};

function compact(n: number | null): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

const CAT_ICON: Record<string, LucideIcon> = {
  momentum: TrendingUp, value: Scale, dividend: Coins, income: Coins, growth: Sprout,
  sector: LayoutGrid, size: Boxes, volatility: Activity, quality: Gem, speculative: Flame,
};

// Robinhood-style "trending list" pill: small circular thumbnail + label. Tapping
// it NAVIGATES to the list's detail page (hero, items, follow, disclosures).
function PresetPill({ p }: { p: PresetCard }) {
  const [imgOk, setImgOk] = useState(true);
  const Icon = CAT_ICON[p.category] ?? LayoutGrid;
  return (
    <Link href={`/screeners/${p.key}`} title={p.blurb}
      className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface py-1.5 pl-1.5 pr-3.5 text-sm text-ink-dim transition-colors hover:border-brand-500/50 hover:text-ink">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
        {imgOk
          ? <img src={p.image} alt="" onError={() => setImgOk(false)} className="h-full w-full object-cover" />
          : <Icon size={15} className={CAT_TINT[p.category] ?? "text-brand-400"} />}
      </span>
      <span className="font-medium">{p.label}</span>
    </Link>
  );
}

export function Screener() {
  const isAdmin = useIsAdmin();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  // `applied` is the committed filter set the query uses — editing the form does
  // NOT refetch until you press Run, so we don't hammer FMP's quota per keystroke.
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [live, setLive] = useState(false); // opt-in polling (off by default to save quota)
  const [showAll, setShowAll] = useState(false);
  const [reranking, setReranking] = useState(false);

  // Preset catalog + the day's AI-chosen order (auto-refreshes after 8am ET).
  const { data: presetData, mutate: mutatePresets } = useSWR<{ presets: PresetCard[]; rankedKeys: string[]; rationale: string | null }>("/api/screener/presets", fetchJsonRaw, { revalidateOnFocus: false });
  const presetMap = useMemo(() => new Map((presetData?.presets ?? []).map((p) => [p.key, p])), [presetData]);
  const orderedPresets = useMemo(() => {
    const order = presetData?.rankedKeys ?? [];
    const ranked = order.map((k) => presetMap.get(k)).filter(Boolean) as PresetCard[];
    const extra = (presetData?.presets ?? []).filter((p) => !order.includes(p.key));
    return [...ranked, ...extra];
  }, [presetData, presetMap]);
  const TOP_N = 8;
  const visiblePresets = showAll ? orderedPresets : orderedPresets.slice(0, TOP_N);

  async function rerank() {
    setReranking(true);
    try { await fetch("/api/screener/presets", { method: "POST" }); await mutatePresets(); }
    finally { setReranking(false); }
  }

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
  const reset = () => { setFilters(EMPTY); setApplied(EMPTY); };

  const inputCls = "w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Trending lists — AI-ordered for today. Click one to run it. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Trending lists</span>
          {isAdmin && (
            <button onClick={rerank} disabled={reranking} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink disabled:opacity-50" title={presetData?.rationale ?? undefined}>
              <Sparkles size={12} className={reranking ? "animate-pulse" : ""} /> {reranking ? "Re-ranking…" : "Re-rank"}
            </button>
          )}
        </div>
        {isAdmin && presetData?.rationale && (
          <p className="mb-2 text-[11px] text-ink-faint">Today: {presetData.rationale}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {visiblePresets.map((p) => (
            <PresetPill key={p.key} p={p} />
          ))}
        </div>
        {orderedPresets.length > TOP_N && (
          <button onClick={() => setShowAll((s) => !s)} className="mt-2 inline-flex items-center gap-1 text-xs text-brand-400 hover:underline">
            <ChevronDown size={13} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
            {showAll ? "Show less" : "Show more"}
          </button>
        )}
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
