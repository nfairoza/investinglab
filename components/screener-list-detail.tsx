"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Plus, ChevronDown, Check, Star, Sparkles, LayoutGrid } from "lucide-react";
import { DataBadge } from "./data-state";
import { AddToList } from "./add-to-list";
import type { DataResult, ScreenerRow, ScreenerFilters } from "@/lib/providers/types";

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

interface PresetCard { key: string; label: string; blurb: string; category: string; filters: ScreenerFilters; image: string }
interface ListRow { id: string; name: string; kind: string; presetKey: string | null }

function compact(n: number | null): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function ScreenerListDetail({ presetKey }: { presetKey: string }) {
  const [imgOk, setImgOk] = useState(true);
  const [showCount, setShowCount] = useState(25);
  const [addSymbol, setAddSymbol] = useState<string | null>(null);
  const [discOpen, setDiscOpen] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);

  // Preset metadata (catalog) + the user's lists (to know follow state).
  const { data: presetData } = useSWR<{ presets: PresetCard[] }>("/api/screener/presets", fetchJson, { revalidateOnFocus: false });
  const preset = presetData?.presets.find((p) => p.key === presetKey);
  // The API gives the 256px thumbnail; the detail hero uses the 768px version.
  const heroImg = `/images/presets-hero/${presetKey}.jpg`;
  const { data: lists, mutate: mutateLists } = useSWR<ListRow[]>("/api/watchlists", fetchJson, { revalidateOnFocus: false });
  const isFollowed = following ?? Boolean((lists ?? []).some((l) => l.kind === "followed" && l.presetKey === presetKey));

  // "You might also like" — related lists, same category first (closest to what
  // they're viewing), then fill from other categories. Excludes this list.
  const related = useMemo(() => {
    const all = presetData?.presets ?? [];
    if (!all.length) return [];
    const self = all.find((p) => p.key === presetKey);
    const sameCat = all.filter((p) => p.key !== presetKey && self && p.category === self.category);
    const others = all.filter((p) => p.key !== presetKey && (!self || p.category !== self.category));
    return [...sameCat, ...others].slice(0, 4);
  }, [presetData, presetKey]);

  // Live results for this list's filters.
  const qs = useMemo(() => {
    const f = preset?.filters ?? {};
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v != null && v !== "") p.set(k, String(v));
    p.set("isActivelyTrading", "true");
    p.set("limit", "300");
    return p.toString();
  }, [preset]);

  const { data, isLoading } = useSWR<DataResult<ScreenerRow[]>>(preset ? `/api/screener?${qs}` : null, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const rows = data?.data ?? [];
  const visible = rows.slice(0, showCount);

  async function toggleFollow() {
    const next = !isFollowed;
    setFollowing(next);
    try {
      if (next) await fetch("/api/watchlists/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presetKey }) });
      else await fetch(`/api/watchlists/follow?presetKey=${presetKey}`, { method: "DELETE" });
      await mutateLists();
    } catch { setFollowing(!next); }
  }

  return (
    <div className="space-y-4">
      <Link href="/screeners" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"><ArrowLeft size={15} /> Trending lists</Link>

      {/* You might also like — related lists at the top (closest to what they're
          viewing), as clickable chips with their thumbnail. */}
      {related.length > 0 && (
        <div className="rounded-xl glass p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Sparkles size={14} className="text-brand-400" /> You might also like
          </div>
          <div className="flex flex-wrap gap-2">
            {related.map((p) => (
              <Link key={p.key} href={`/screeners/${p.key}`}
                className="group inline-flex items-center gap-2 rounded-full border border-hairline bg-surface py-1 pl-1 pr-3 text-sm text-ink-dim transition-colors hover:border-brand-500/50 hover:text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
                  <img src={p.image} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </span>
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-5">
        <div className="space-y-4">
      {/* Hero — the artwork is a square illustration, so show it as a crisp
          contained square (no wide-band crop) next to the title, on a soft
          backdrop tinted from the same image. */}
      <div className="relative overflow-hidden rounded-2xl glass">
        {/* Blurred, dimmed fill of the same image as an ambient backdrop. */}
        {imgOk && preset && (
          <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
            <img src={heroImg} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-solid)] via-[var(--surface-solid)]/70 to-transparent" />
        <div className="relative flex items-center gap-5 p-5">
          {/* Crisp contained square thumbnail of the full image. */}
          <div className="hidden h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-hairline shadow-lg sm:block">
            {imgOk && preset
              ? <img src={heroImg} alt="" onError={() => setImgOk(false)} className="h-full w-full object-cover" />
              : <div className="h-full w-full bg-gradient-to-br from-brand-600/40 to-black/50" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-semibold text-ink">{preset?.label ?? "Trending list"}</h1>
                <p className="mt-1 text-sm text-ink-dim">{preset?.blurb}</p>
                <p className="mt-1 text-xs text-ink-faint">{isLoading ? "Loading…" : `${rows.length} item${rows.length === 1 ? "" : "s"}`}{data && <span className="ml-2 inline-block align-middle"><DataBadge source={data.source} /></span>}</p>
              </div>
              <button onClick={toggleFollow}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${isFollowed ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-hairline text-ink-dim hover:text-ink"}`}>
                {isFollowed ? <><Check size={14} /> Following</> : <><Star size={14} /> Follow</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      {data?.source === "unavailable" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">List data unavailable{data.note ? `: ${data.note}` : ""}.</div>
      )}
      {rows.length > 0 && (
        <>
          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-hairline sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Name</th><th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Today</th>
                  <th className="px-3 py-2 text-right">Mkt cap</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visible.map((r) => (
                  <tr key={r.symbol} className="hover:bg-surface">
                    <td className="px-3 py-2 max-w-[18rem] truncate"><Link href={`/research?symbol=${r.symbol}`} className="text-ink hover:text-brand-300">{r.name ?? r.symbol}</Link></td>
                    <td className="px-3 py-2"><Link href={`/research?symbol=${r.symbol}`} className="font-mono font-semibold text-brand-300 hover:underline">{r.symbol}</Link></td>
                    <td className="px-3 py-2 text-right text-ink-dim">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                    <td className={`px-3 py-2 text-right ${r.changePct == null ? "text-ink-faint" : r.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {r.changePct == null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-dim">{compact(r.marketCap)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setAddSymbol(r.symbol)} title={`Add ${r.symbol} to a list`} className="rounded-md p-1 text-ink-faint hover:bg-surface-raised hover:text-brand-300"><Plus size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked rows — symbol + price/change on one line, name +
              mkt cap below, so nothing overflows the viewport. */}
          <div className="divide-y divide-white/5 rounded-2xl border border-hairline sm:hidden">
            {visible.map((r) => (
              <div key={r.symbol} className="flex items-center gap-2 px-3 py-2.5">
                <Link href={`/research?symbol=${r.symbol}`} className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-semibold text-brand-300">{r.symbol}</span>
                    <span className={`text-xs ${r.changePct == null ? "text-ink-faint" : r.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {r.changePct == null ? "" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="truncate text-xs text-ink-dim">{r.name ?? r.symbol}</div>
                </Link>
                <div className="shrink-0 text-right">
                  <div className="text-sm text-ink">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</div>
                  <div className="text-[11px] text-ink-faint">{compact(r.marketCap)}</div>
                </div>
                <button onClick={() => setAddSymbol(r.symbol)} title={`Add ${r.symbol} to a list`} className="shrink-0 rounded-md p-1 text-ink-faint hover:bg-surface-raised hover:text-brand-300"><Plus size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      {rows.length > showCount && (
        <button onClick={() => setShowCount((c) => c + 50)} className="inline-flex items-center gap-1 text-sm text-brand-400 hover:underline">
          <ChevronDown size={14} /> Show more ({rows.length - showCount} more)
        </button>
      )}

      {/* Disclosures */}
      <div className="rounded-2xl border border-hairline bg-surface p-4 text-[11px] text-ink-faint">
        <p>This list is generated for informational purposes only from public market data and is not investment advice or a recommendation. Securities shown may not be suitable for you; do your own research before buying or selling. All investing involves risk, including possible loss of principal.</p>
        <button onClick={() => setDiscOpen((o) => !o)} className="mt-2 font-medium text-brand-400 hover:underline">{discOpen ? "Show less" : "Full disclosure"}</button>
        {discOpen && (
          <div className="mt-2 space-y-2">
            <p>Lists may be generated in whole or in part using data from third-party providers, which may not be current. We make no warranty as to the accuracy, timeliness, or completeness of any third-party information. Past performance is no guarantee of future results.</p>
            <p>ETFs designed to track an index may not exactly replicate that index due to fees and other factors. ETF shares trade at market price, which may differ from net asset value, and may generate tax consequences. Consider an ETF&apos;s objectives, risks, charges, and expenses — found in its prospectus — before investing.</p>
            <p>Research and educational analysis only. Not a broker-dealer; not investment, legal, or tax advice.</p>
          </div>
        )}
      </div>
        </div>

        {/* Your lists rail — same as the screener index, so it stays available
            while viewing a list. */}
        <aside className="mt-4 lg:mt-0">
          <div className="lg:sticky lg:top-4 rounded-xl glass p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Your lists</span>
              <Link href="/watchlist" aria-label="Manage lists" className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink"><Plus size={15} /></Link>
            </div>
            <div className="space-y-1">
              {(lists ?? []).map((l) => {
                const href = l.kind === "followed" && l.presetKey ? `/screeners/${l.presetKey}` : "/watchlist";
                const img = l.kind === "followed" && l.presetKey ? `/images/presets/${l.presetKey}.jpg` : null;
                return (
                  <Link key={l.id} href={href}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface ${l.kind === "followed" && l.presetKey === presetKey ? "bg-brand-500/10" : ""}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : l.kind === "followed" ? <Star size={14} className="text-brand-400" /> : <LayoutGrid size={14} className="text-ink-faint" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-dim">{l.name}</span>
                    {l.kind !== "followed" && <span className="text-[11px] text-ink-faint">{(l as any).count ?? ""}</span>}
                  </Link>
                );
              })}
              {(lists ?? []).length === 0 && <p className="px-2 py-3 text-xs text-ink-faint">No lists yet. Follow a trending list or create one in Watchlist.</p>}
            </div>
          </div>
        </aside>
      </div>

      {addSymbol && <AddToList symbol={addSymbol} onClose={() => setAddSymbol(null)} />}
    </div>
  );
}
