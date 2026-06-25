"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw, ChevronDown, Sparkles, TrendingUp, Scale, Coins, Sprout, LayoutGrid, Boxes, Activity, Gem, Flame, Filter as FilterIcon, Star, Plus, type LucideIcon } from "lucide-react";
import { DataBadge } from "./data-state";
import { useIsAdmin } from "./use-is-admin";
import { ScreenerFiltersPanel, EMPTY_FILTERS, type ScreenFormFilters } from "./screener-filters";
import type { DataResult, ScreenerRow, ScreenerFilters } from "@/lib/providers/types";

const fetchJson = (u: string) => fetch(u).then((r) => r.json() as Promise<DataResult<ScreenerRow[]>>);
const fetchJsonRaw = (u: string) => fetch(u).then((r) => r.json());

interface PresetCard { key: string; label: string; blurb: string; category: string; filters: ScreenerFilters; image: string }
interface ListRow { id: string; name: string; kind: string; presetKey: string | null; count: number }

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
  const [filters, setFilters] = useState<ScreenFormFilters>(EMPTY_FILTERS);
  // `applied` is the committed filter set the query uses — editing the form does
  // NOT refetch until you press Run, so we don't hammer FMP's quota per keystroke.
  const [applied, setApplied] = useState<ScreenFormFilters>(EMPTY_FILTERS);
  const [live, setLive] = useState(false); // opt-in polling (off by default to save quota)
  const [showAll, setShowAll] = useState(false);
  const [reranking, setReranking] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile drawer

  // User's watch lists for the right-hand "Your lists" rail.
  const { data: lists } = useSWR<ListRow[]>("/api/watchlists", fetchJsonRaw, { revalidateOnFocus: false });

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
    const a = applied;
    if (a.marketCapMoreThan) p.set("marketCapMoreThan", a.marketCapMoreThan);
    if (a.marketCapLowerThan) p.set("marketCapLowerThan", a.marketCapLowerThan);
    if (a.priceMoreThan) p.set("priceMoreThan", a.priceMoreThan);
    if (a.priceLowerThan) p.set("priceLowerThan", a.priceLowerThan);
    if (a.volumeMoreThan) p.set("volumeMoreThan", a.volumeMoreThan);
    if (a.betaMoreThan) p.set("betaMoreThan", a.betaMoreThan);
    if (a.betaLowerThan) p.set("betaLowerThan", a.betaLowerThan);
    if (a.dividendMoreThan) p.set("dividendMoreThan", a.dividendMoreThan);
    if (a.sector) p.set("sector", a.sector);
    if (a.exchange) p.set("exchange", a.exchange);
    if (a.isEtf) p.set("isEtf", a.isEtf);
    p.set("isActivelyTrading", "true");
    p.set("limit", "100");
    return p.toString();
  }, [applied]);

  const { data, isLoading, mutate, isValidating } = useSWR(`/api/screener?${qs}`, fetchJson, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    refreshInterval: live ? 30_000 : 0,
  });

  const rows = data?.data ?? [];
  const run = () => setApplied(filters);
  const reset = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  const activeFilterCount = Object.values(applied).filter((v) => v !== "").length;

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

      {/* Mobile: open filters drawer */}
      <div className="lg:hidden">
        <button onClick={() => setFiltersOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink">
          <FilterIcon size={14} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {/* Layout: filter rail · results · lists rail (rails collapse on small screens) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr_230px]">
        {/* Desktop filter rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl glass p-4" style={{ maxHeight: "calc(100vh - 6rem)" }}>
            <ScreenerFiltersPanel value={filters} onChange={setFilters} onApply={run} onReset={reset} />
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-dim">{isLoading ? "Screening…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-dim hover:text-ink">
                <RefreshCw size={12} className={isValidating ? "animate-spin" : ""} /> Refresh
              </button>
              {data && <DataBadge source={data.source} />}
            </div>
          </div>

          {data?.source === "unavailable" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
              Screener unavailable{data.note ? `: ${data.note}` : ""}.
            </div>
          )}

          {data && data.source !== "unavailable" && rows.length === 0 && !isLoading && (
            <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">
              No stocks match these filters. Loosen a constraint or try a trending list.
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
            Data via Financial Modeling Prep, cached ~90s. Research data, not a recommendation.
          </p>
        </div>

        {/* Your lists rail */}
        <aside className="lg:block">
          <div className="rounded-xl glass p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Your lists</span>
              <Link href="/watchlist" aria-label="Manage lists" className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink"><Plus size={15} /></Link>
            </div>
            <div className="space-y-1">
              {(lists ?? []).map((l) => {
                const href = l.kind === "followed" && l.presetKey ? `/screeners/${l.presetKey}` : "/watchlist";
                const img = l.kind === "followed" && l.presetKey ? `/images/presets/${l.presetKey}.jpg` : null;
                return (
                  <Link key={l.id} href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : l.kind === "followed" ? <Star size={14} className="text-brand-400" /> : <LayoutGrid size={14} className="text-ink-faint" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-dim">{l.name}</span>
                    {l.kind !== "followed" && <span className="text-[11px] text-ink-faint">{l.count}</span>}
                  </Link>
                );
              })}
              {(lists ?? []).length === 0 && <p className="px-2 py-3 text-xs text-ink-faint">No lists yet. Follow a trending list or create one in Watchlist.</p>}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile filters drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-[88%] max-w-sm overflow-hidden p-4" style={{ background: "var(--surface-solid)" }}>
            <ScreenerFiltersPanel value={filters} onChange={setFilters} onApply={run} onReset={reset} onClose={() => setFiltersOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
