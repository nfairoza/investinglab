"use client";

import { useState } from "react";
import useSWR from "swr";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { DataBadge, DataTimestamp } from "./data-state";
import { TickerInput } from "./ticker-input";
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

const ACTION_STYLE: Record<string, string> = {
  "Buy now": "border-emerald-500/40 text-emerald-300",
  "Start small": "border-emerald-500/30 text-emerald-300/90",
  "Wait": "border-amber-500/40 text-amber-300",
  "Avoid": "border-rose-500/40 text-rose-300",
};

export function WatchlistManager() {
  const { data: items = [], mutate } = useSWR<WatchItem[]>("/api/watchlist", fetchJson, { revalidateOnFocus: true });

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
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: s, idealBuy: Number.isFinite(target) && target > 0 ? target : undefined, note: note.trim() || undefined }),
    });
    setSymbol(""); setIdealBuy(""); setNote("");
    mutate();
  }

  async function removeItem(id: string) {
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    mutate();
  }

  // ── Reorder (drag, or up/down buttons) ──────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);

  async function persistOrder(ordered: WatchItem[]) {
    // Optimistic: show the new order immediately, then persist.
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

  function move(id: string, dir: -1 | 1) {
    const i = items.findIndex((w) => w.id === id);
    if (i === -1) return;
    moveTo(id, i + dir);
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
          <div className="flex items-center gap-2">{anySource && <DataBadge source={anySource} />}</div>
          <p className="text-[11px] text-ink-faint">Drag the <GripVertical size={11} className="inline" /> handle (or use ↑ ↓) to reorder. New tickers land on top.</p>
          <div className="space-y-3">
            {items.map((w, idx) => {
              const price = quotes?.[w.symbol]?.data?.price ?? null;
              const atOrBelow = price != null && w.idealBuy != null ? price <= w.idealBuy : null;
              const busy = busyId === w.id;
              return (
                <div key={w.id}
                  onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                  onDrop={() => onDrop(w.id)}
                  onClick={() => { window.location.href = `/research?symbol=${w.symbol}`; }}
                  role="link" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") window.location.href = `/research?symbol=${w.symbol}`; }}
                  title={`Open research for ${w.symbol}`}
                  className={`glass card-hover cursor-pointer rounded-2xl p-4 transition-opacity ${dragId === w.id ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        draggable
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => { e.stopPropagation(); setDragId(w.id); }}
                        onDragEnd={() => setDragId(null)}
                        title="Drag to reorder"
                        className="cursor-grab touch-none text-ink-faint hover:text-ink-dim active:cursor-grabbing"
                      >
                        <GripVertical size={16} />
                      </span>
                      <span className="font-display text-lg font-semibold text-brand-300">{w.symbol}</span>
                      <span className="text-sm text-ink-dim">{price != null ? `$${price.toFixed(2)}` : "—"}</span>
                      {w.aiAction && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${ACTION_STYLE[w.aiAction] ?? "border-hairline-strong text-ink-dim"}`}>{w.aiAction}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center">
                        <button onClick={() => move(w.id, -1)} disabled={idx === 0} title="Move up"
                          className="rounded-md p-1 text-ink-faint hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"><ChevronUp size={15} /></button>
                        <button onClick={() => move(w.id, 1)} disabled={idx === items.length - 1} title="Move down"
                          className="rounded-md p-1 text-ink-faint hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"><ChevronDown size={15} /></button>
                      </div>
                      <button onClick={() => analyze(w.id)} disabled={busy}
                        className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
                        {busy ? "Analyzing…" : w.analyzedAt ? "Refresh analysis" : "Analyze"}
                      </button>
                      <button onClick={() => removeItem(w.id)} className="text-xs text-ink-faint hover:text-rose-300">Remove</button>
                    </div>
                  </div>

                  {/* metrics row */}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <Field label="Ideal buy" value={w.idealBuy != null ? `$${w.idealBuy.toFixed(2)}` : "—"} />
                    <Field label="Vs. target" value={atOrBelow == null ? "—" : atOrBelow ? "● at/below" : "above"} cls={atOrBelow ? "text-emerald-400" : "text-ink-dim"} />
                    <Field label="Fair value" value={w.fairValue ?? "—"} />
                    <Field label="Next catalyst" value={w.catalyst ?? "—"} />
                  </div>

                  {(w.bullCase || w.bearCase) && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {w.bullCase && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:bg-emerald-500/5 dark:text-emerald-100"><span className="font-medium">Bull:</span> {w.bullCase}</div>}
                      {w.bearCase && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-800 dark:bg-rose-500/5 dark:text-rose-100"><span className="font-medium">Bear:</span> {w.bearCase}</div>}
                    </div>
                  )}

                  {w.note && <p className="mt-2 text-xs text-ink-faint">{w.note}</p>}
                  {w.analyzedAt && <p className="mt-1 text-[10px] text-ink-faint">AI analysis {new Date(w.analyzedAt).toLocaleString()}</p>}
                </div>
              );
            })}
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
