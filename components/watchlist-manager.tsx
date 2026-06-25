"use client";

import { useState } from "react";
import useSWR from "swr";
import { GripVertical, ChevronRight, ExternalLink, X, ArrowUp, ArrowDown } from "lucide-react";
import { DataBadge, DataTimestamp } from "./data-state";
import { TickerInput } from "./ticker-input";
import { Sparkline } from "./charts/Sparkline";
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

// Last ~30 daily closes per symbol, for the mini trend sparkline.
async function fetchSparks(symbols: string[]): Promise<Record<string, { v: number }[]>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const d = (await fetch(`/api/price-history?symbol=${s}`).then((r) => r.json())) as { data?: { points?: { close: number }[] } };
        return [s, (d.data?.points ?? []).slice(-30).map((p) => ({ v: p.close }))] as const;
      } catch {
        return [s, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

const ACTION_STYLE: Record<string, string> = {
  "Buy now": "border-emerald-500/40 text-emerald-300",
  "Start small": "border-emerald-500/30 text-emerald-300/90",
  "Wait": "border-amber-500/40 text-amber-300",
  "Avoid": "border-rose-500/40 text-rose-300",
};

export function WatchlistManager({ listId }: { listId?: string } = {}) {
  // When a listId is given, read/write that specific list via the multi-list
  // endpoints; otherwise fall back to the flat default-list compat endpoint.
  const itemsUrl = listId ? `/api/watchlists/${listId}` : "/api/watchlist";
  const { data: raw, mutate } = useSWR<any>(itemsUrl, fetchJson, { revalidateOnFocus: true });
  const items: WatchItem[] = listId ? (raw?.items ?? []) : (raw ?? []);

  const [symbol, setSymbol] = useState("");
  const [idealBuy, setIdealBuy] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);

  const symbols = items.map((w) => w.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["watch-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const { data: sparks } = useSWR(
    symbols.length ? ["watch-sparks", symbols.join(",")] : null,
    () => fetchSparks(symbols),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  // Add a symbol. If `validated` (came from a dropdown pick) skip the check;
  // otherwise validate it exists before adding, so typos can't get added.
  async function addItem(sym?: string, validated = false) {
    const s = (sym ?? symbol).trim().toUpperCase();
    if (!s) return;
    setAddErr(null);
    if (!validated) {
      try {
        const v = await fetch("/api/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: s }),
        }).then((r) => r.json());
        if (!v.valid) { setAddErr(`"${s}" isn't a recognized ticker — pick one from the dropdown.`); return; }
      } catch { /* fail open */ }
    }
    const target = Number(idealBuy);
    const body = JSON.stringify({ symbol: s, idealBuy: Number.isFinite(target) && target > 0 ? target : undefined, note: note.trim() || undefined });
    if (listId) await fetch(`/api/watchlists/${listId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    else await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    setSymbol(""); setIdealBuy(""); setNote("");
    mutate();
  }

  async function removeItem(id: string) {
    if (listId) await fetch(`/api/watchlists/${listId}/items?itemId=${id}`, { method: "DELETE" });
    else await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    mutate();
  }

  // ── Reorder (drag, or up/down buttons) ──────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);

  async function persistOrder(ordered: WatchItem[]) {
    // Reordering is only persisted for the default list (compat PATCH). For a
    // specific custom list, reflect locally but don't persist (no endpoint yet).
    if (listId) { mutate({ ...(raw ?? {}), items: ordered }, { revalidate: false }); return; }
    mutate(ordered, { revalidate: false });
    await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ordered.map((w) => w.id) }),
    }).catch(() => {});
    mutate();
  }

  function moveTo(fromId: string, toIndex: number) {
    const from = items.findIndex((w) => w.id === fromId);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(items.length - 1, toIndex));
    if (from === clamped) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(clamped, 0, moved);
    persistOrder(next);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const target = items.findIndex((w) => w.id === targetId);
    moveTo(dragId, target);
    setDragId(null);
  }

  async function analyze(id: string) {
    setBusyId(id);
    try {
      const r = await fetch("/api/watchlist/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // surface errors quietly via mutate; the row just won't update on failure
      await r.json().catch(() => ({}));
      mutate();
    } finally {
      setBusyId(null);
    }
  }

  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Inline sorting ──────────────────────────────────────────────────────────
  // null = manual (drag) order. Otherwise sort by a column. Dragging is only
  // offered in manual mode (reordering a sorted view would be meaningless).
  type SortKey = "symbol" | "price" | "day" | "ideal" | "target";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        // symbol → asc → desc → off; numeric → desc → asc → off
        return prev.dir === (key === "symbol" ? "asc" : "desc")
          ? { key, dir: key === "symbol" ? "desc" : "asc" }
          : null;
      }
      return { key, dir: key === "symbol" ? "asc" : "desc" };
    });
  }

  // Numeric value for a row by sort key; null sorts last regardless of dir.
  function sortVal(w: WatchItem, key: SortKey): number | string | null {
    const price = quotes?.[w.symbol]?.data?.price ?? null;
    switch (key) {
      case "symbol": return w.symbol;
      case "price": return price;
      case "day": return quotes?.[w.symbol]?.data?.changePct ?? null;
      case "ideal": return w.idealBuy ?? null;
      case "target": return price != null && w.idealBuy != null ? price / w.idealBuy : null; // <1 = below target
    }
  }

  const displayItems = (() => {
    if (!sort) return items;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls always last
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  })();

  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;
  const inputCls = "w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <TickerInput value={symbol} onChange={setSymbol} onSelect={(s) => addItem(s, true)}
            placeholder="Search ticker or company…" className={inputCls} />
          <input value={idealBuy} onChange={(e) => setIdealBuy(e.target.value)} placeholder="Ideal buy $ (optional)" inputMode="decimal" className={inputCls} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <button onClick={() => addItem()} className="btn-gold rounded-md px-3 py-2 text-sm">Add to watchlist</button>
        </div>
        {addErr && <p className="mt-2 text-[11px] text-rose-400">{addErr}</p>}
        <p className="mt-2 text-[11px] text-ink-faint">Tip: pick a ticker from the dropdown to add it instantly. Then use <span className="text-brand-300">Analyze</span> — AI fills the ideal buy, fair value, and thesis from live data.</p>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">
          Nothing on your watchlist yet. Add a ticker you&apos;re considering above.
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-faint">
              {sort
                ? <>Sorted by column — <button onClick={() => setSort(null)} className="text-brand-300 hover:underline">clear to drag-reorder</button>.</>
                : <>Drag <GripVertical size={11} className="inline" /> to reorder, or click a column header to sort. Click a row to expand · ↗ opens research.</>}
            </p>
            {anySource && <DataBadge source={anySource} />}
          </div>

          <div className="overflow-hidden rounded-xl glass">
            {/* Column header — click to sort */}
            <div className="hidden items-center gap-3 border-b border-hairline px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint sm:flex">
              <span className="w-4" />
              <SortHeader label="Ticker" sortKey="symbol" sort={sort} onSort={toggleSort} className="w-24" />
              <span className="w-16 text-center">Trend</span>
              <SortHeader label="Price" sortKey="price" sort={sort} onSort={toggleSort} className="w-24 justify-end" />
              <SortHeader label="Today" sortKey="day" sort={sort} onSort={toggleSort} className="w-20 justify-end" />
              <SortHeader label="Ideal buy" sortKey="ideal" sort={sort} onSort={toggleSort} className="w-24 justify-end" />
              <SortHeader label="Vs. target" sortKey="target" sort={sort} onSort={toggleSort} className="w-24 justify-center" />
              <span className="flex-1">Next catalyst</span>
              <span className="w-32 text-right">Actions</span>
            </div>

            <div className="divide-y divide-hairline">
              {displayItems.map((w) => {
                const price = quotes?.[w.symbol]?.data?.price ?? null;
                const dayPct = quotes?.[w.symbol]?.data?.changePct ?? null;
                const spark = sparks?.[w.symbol] ?? [];
                const atOrBelow = price != null && w.idealBuy != null ? price <= w.idealBuy : null;
                const busy = busyId === w.id;
                const isOpen = expanded === w.id;
                const hasDetail = w.bullCase || w.bearCase || w.note || w.fairValue || w.analyzedAt;
                const canDrag = !sort; // dragging only makes sense in manual order
                return (
                  <div key={w.id}
                    onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                    onDrop={() => onDrop(w.id)}
                    className={`transition-opacity ${dragId === w.id ? "opacity-50" : ""}`}>
                    {/* Compact row */}
                    <div
                      onClick={() => hasDetail && setExpanded(isOpen ? null : w.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 text-sm ${hasDetail ? "cursor-pointer hover:bg-surface" : ""}`}>
                      {/* drag handle + expand chevron */}
                      <span
                        draggable={canDrag}
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => { if (!canDrag) return; e.stopPropagation(); setDragId(w.id); }}
                        onDragEnd={() => setDragId(null)}
                        title={canDrag ? "Drag to reorder" : "Clear sorting to drag-reorder"}
                        className={`shrink-0 text-ink-faint ${canDrag ? "cursor-grab touch-none hover:text-ink-dim active:cursor-grabbing" : "opacity-30"}`}>
                        <GripVertical size={15} />
                      </span>

                      {/* Ticker */}
                      <div className="flex w-24 shrink-0 items-center gap-2">
                        {hasDetail && <ChevronRight size={13} className={`shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />}
                        <span className="font-semibold text-brand-300">{w.symbol}</span>
                      </div>

                      {/* Mini trend sparkline (30d) */}
                      <div className="hidden h-7 w-16 shrink-0 sm:block">
                        {spark.length > 1 ? <Sparkline data={spark} height={28} /> : <span className="block pt-2 text-center text-xs text-ink-faint">—</span>}
                      </div>

                      <span className="w-24 shrink-0 text-right font-mono text-ink">{price != null ? `$${price.toFixed(2)}` : "—"}</span>

                      {/* Today's % change — green up / red down, Robinhood-style */}
                      <span className={`w-20 shrink-0 text-right font-mono text-xs ${dayPct == null ? "text-ink-faint" : dayPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {dayPct == null ? "—" : `${dayPct >= 0 ? "▲" : "▼"} ${Math.abs(dayPct).toFixed(2)}%`}
                      </span>

                      <span className="w-24 shrink-0 text-right font-mono text-ink-dim">{w.idealBuy != null ? `$${w.idealBuy.toFixed(2)}` : "—"}</span>
                      <span className={`w-24 shrink-0 text-center text-xs ${atOrBelow ? "text-emerald-400" : "text-ink-faint"}`}>
                        {atOrBelow == null ? "—" : atOrBelow ? "● at/below" : "above"}
                      </span>

                      {/* catalyst + action chip (catalyst hidden on small screens) */}
                      <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
                        <span className="truncate text-xs text-ink-dim">{w.catalyst ?? "—"}</span>
                        {w.aiAction && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${ACTION_STYLE[w.aiAction] ?? "border-hairline-strong text-ink-dim"}`}>{w.aiAction}</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center justify-end gap-0.5 sm:w-32" onClick={(e) => e.stopPropagation()}>
                        <a href={`/research?symbol=${w.symbol}`} title={`Research ${w.symbol}`}
                          className="rounded p-1 text-ink-faint hover:bg-surface hover:text-brand-300"><ExternalLink size={14} /></a>
                        <button onClick={() => analyze(w.id)} disabled={busy} title={w.analyzedAt ? "Refresh AI analysis" : "Run AI analysis"}
                          className="ml-1 rounded-md border border-brand-500/50 bg-brand-500/10 px-2 py-1 text-[11px] font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
                          {busy ? "…" : w.analyzedAt ? "↻" : "Analyze"}
                        </button>
                        <button onClick={() => removeItem(w.id)} title="Remove"
                          className="rounded p-1 text-ink-faint hover:text-rose-300"><X size={14} /></button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="bg-black/10 px-3 pb-3 pt-1 dark:bg-white/[0.02]">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                          <Field label="Fair value" value={w.fairValue ?? "—"} />
                          <Field label="Next catalyst" value={w.catalyst ?? "—"} />
                          <Field label="Ideal buy" value={w.idealBuy != null ? `$${w.idealBuy.toFixed(2)}` : "—"} />
                          <Field label="AI action" value={w.aiAction ?? "—"} />
                        </div>
                        {(w.bullCase || w.bearCase) && (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {w.bullCase && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:bg-emerald-500/5 dark:text-emerald-100"><span className="font-medium">Bull:</span> {w.bullCase}</div>}
                            {w.bearCase && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-800 dark:bg-rose-500/5 dark:text-rose-100"><span className="font-medium">Bear:</span> {w.bearCase}</div>}
                          </div>
                        )}
                        {w.note && <p className="mt-2 text-xs text-ink-faint"><span className="font-medium text-ink-dim">Note:</span> {w.note}</p>}
                        {w.analyzedAt && <p className="mt-1 text-[10px] text-ink-faint">AI analysis {new Date(w.analyzedAt).toLocaleString()}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {quotes && <DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} />}
        </>
      )}

      <p className="text-[11px] text-ink-faint">
        Saved to <code>data/db.json</code> — persists across restarts. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}

function Field({ label, value, cls = "text-ink-dim" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="border-b border-hairline py-1">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`text-sm ${cls}`}>{value}</div>
    </div>
  );
}

// Clickable, sortable column header. Shows an arrow when active.
function SortHeader<K extends string>({
  label, sortKey, sort, onSort, className = "",
}: {
  label: string;
  sortKey: K;
  sort: { key: K; dir: "asc" | "desc" } | null;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-ink ${active ? "text-brand-300" : ""} ${className}`}
    >
      {label}
      {active && (sort!.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );
}
