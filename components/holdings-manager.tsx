"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUp, ArrowDown, RefreshCw, Plus, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { DataBadge, DataTimestamp } from "./data-state";
import { ConnectEmptyState } from "./connect-empty-state";
import { TickerInput } from "./ticker-input";
import { Sparkline } from "./charts/Sparkline";
import type { DataResult, Quote } from "@/lib/providers/types";
import type { Holding } from "@/lib/db";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Money formatter that reconciles with the % shown next to it. Small gains
// rounded to whole dollars (e.g. $7.50 → "$8") stop matching their exact
// percentage; show cents under $1,000 so the dollars and % agree, drop cents
// above that where rounding noise is negligible.
function money(n: number): string {
  const abs = Math.abs(n);
  const frac = abs < 1000 ? 2 : 0;
  return abs.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
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

interface PlaidHolding { symbol: string; name: string | null; hasRealTicker?: boolean; quantity: number; price: number | null; value: number | null; costBasis: number | null; currency: string; institution: string; secType?: string | null; isCashEquivalent?: boolean }

// security  = priceable/researchable ticker → main equities table
// crypto    = its own card
// fund      = mutual fund / CUSIP-only holding with NO live ticker → "Funds & other" card
// other     = cash equivalents, options/derivatives, bonds → excluded from totals
type HoldingKind = "security" | "crypto" | "fund" | "other";

function classifyHolding(opts: { symbol: string; secType?: string | null; isCashEquivalent?: boolean; assetType?: string; hasRealTicker?: boolean }): HoldingKind {
  if (opts.assetType === "crypto") return "crypto";
  const t = (opts.secType ?? "").toLowerCase();
  if (t.includes("crypto")) return "crypto";
  if (opts.isCashEquivalent || t === "cash") return "other";
  if (t.includes("derivative") || t.includes("option") || t.includes("fixed income") || t.includes("bond")) return "other";
  // Plaid holdings flagged without a real ticker (mutual funds, CUSIP-only) →
  // can't be priced/researched by ticker, so keep them out of the equities table.
  if (opts.hasRealTicker === false) return "fund";
  return "security";
}

export function HoldingsManager() {
  const { data: dbHoldings = [], mutate } = useSWR<Holding[]>("/api/holdings", fetchJson, {
    revalidateOnFocus: true,
  });
  // Line-by-line holdings from Plaid-linked brokerages (Robinhood, Fidelity,
  // etc.), merged into the same unified table, tagged by institution.
  const { data: plaidInv } = useSWR<{ holdings: PlaidHolding[] }>("/api/plaid/investments", fetchJson, { revalidateOnFocus: false });

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [note, setNote] = useState("");
  const [syncingEtrade, setSyncingEtrade] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  // Manual entry is secondary (most holdings come from E*TRADE/Plaid sync), so
  // the form is collapsed behind a toggle rather than dominating the top.
  const [showAdd, setShowAdd] = useState(false);

  // Merge DB holdings (manual + E*TRADE) with Plaid brokerage holdings into one
  // unified list. Plaid rows are read-only and carry their own price/value.
  // De-dup: if the same brokerage is connected BOTH via E*TRADE sync and Plaid,
  // drop the Plaid copy of that institution and keep the E*TRADE-sourced rows
  // (E*TRADE wins). Manual entries are never de-duped — they're separate data.
  const allHoldings: Holding[] = useMemo(() => {
    const haveEtrade = dbHoldings.some((h) => h.source === "etrade");
    const isEtradeInstitution = (name: string) => /e[\s*]*trade|morgan stanley/i.test(name);
    const plaidRows: Holding[] = (plaidInv?.holdings ?? [])
      .filter((p) => p.symbol && p.symbol !== "—")
      .filter((p) => !(haveEtrade && isEtradeInstitution(p.institution))) // E*TRADE wins
      .map((p) => {
        const kind = classifyHolding({ symbol: p.symbol, secType: p.secType, isCashEquivalent: p.isCashEquivalent, hasRealTicker: p.hasRealTicker });
        return {
          id: `plaid:${p.institution}:${p.symbol}`,
          symbol: String(p.symbol).toUpperCase(),
          shares: Number(p.quantity) || 0,
          avgCost: p.costBasis != null && p.quantity ? Number(p.costBasis) / Number(p.quantity) : 0,
          source: p.institution, // institution name acts as the source/account tag
          marketValue: p.value ?? undefined,
          assetType: kind === "crypto" ? "crypto" : undefined,
          kind,
          displayName: p.name ?? undefined, // fund full name (no ticker)
          plaidPrice: p.price ?? undefined,  // broker-provided price for fund rows
          readOnly: true,
        } as unknown as Holding;
      });
    const dbRows: Holding[] = dbHoldings.map((h) => ({ ...h, kind: classifyHolding({ symbol: h.symbol, assetType: h.assetType }) }) as unknown as Holding);
    return [...dbRows, ...plaidRows];
  }, [dbHoldings, plaidInv]);

  // Split by kind: securities (stocks/ETFs/funds) fill the main table; crypto
  // gets its own card; "other" (cash equivalents, options, bonds) is excluded
  // from the equities table and its totals.
  const kindOf = (h: Holding) => (h as any).kind as HoldingKind | undefined;
  const securities = allHoldings.filter((h) => (kindOf(h) ?? "security") === "security");
  const cryptoHoldings = allHoldings.filter((h) => kindOf(h) === "crypto");
  const fundHoldings = allHoldings.filter((h) => kindOf(h) === "fund");

  // Which sources actually exist among securities (for the relevant filter chips).
  const presentSources = Array.from(new Set(securities.map((h) => h.source ?? "manual")));
  const holdings = sourceFilter === "all"
    ? securities
    : securities.filter((h) => (h.source ?? "manual") === sourceFilter);

  const symbols = holdings.map((h) => h.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["holdings-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const { data: sparks } = useSWR(
    symbols.length ? ["holdings-sparks", symbols.join(",")] : null,
    () => fetchSparks(symbols),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  // Inline sorting (null = insertion order).
  type SortKey = "symbol" | "shares" | "avgCost" | "price" | "value" | "day" | "total" | "weight";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  // Which summed/multi-account symbols are expanded to show per-account rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (sym: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(sym) ? next.delete(sym) : next.add(sym);
    return next;
  });
  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === (key === "symbol" ? "asc" : "desc")
          ? { key, dir: key === "symbol" ? "desc" : "asc" }
          : null;
      }
      return { key, dir: key === "symbol" ? "asc" : "desc" };
    });
  }

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

  async function syncFromEtrade(silent = false) {
    setSyncingEtrade(true);
    if (!silent) setSyncMsg(null);
    try {
      const r = await fetch("/api/etrade/positions");
      if (r.status === 401) { if (!silent) setSyncMsg("E*TRADE session expired — go to Connect brokerage and reconnect."); return; }
      if (!r.ok) { if (!silent) { const j = await r.json().catch(() => ({})); setSyncMsg((j as any).error ?? "Sync failed."); } return; }
      const { holdings: synced, accountName, syncedAt, equityPositions } = await r.json() as {
        holdings: { symbol: string; shares: number; avgCost: number; note?: string }[];
        accountName: string; syncedAt: string; equityPositions: number;
      };
      await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true, holdings: synced.map((h) => ({ ...h, source: "etrade" })) }),
      });
      // Also refresh available cash from the broker balance (best-effort).
      fetch("/api/etrade/balance").catch(() => {});
      mutate();
      setSyncMsg(`Synced ${equityPositions} position${equityPositions !== 1 ? "s" : ""} from ${accountName}. ${new Date(syncedAt).toLocaleTimeString()}`);
    } catch (e) {
      if (!silent) setSyncMsg(e instanceof Error ? e.message : "Sync error");
    } finally {
      setSyncingEtrade(false);
    }
  }

  // Auto-sync from E*TRADE on first load when connected — no button click needed.
  // Runs once per mount; silent so it won't show errors if the session lapsed.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    (async () => {
      try {
        const s = await fetch("/api/etrade/status").then((r) => r.json());
        if (s?.connected && s?.selectedAccountIdKey) {
          await syncFromEtrade(true);
        }
      } catch { /* ignore — manual sync still available */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Apply the chosen sort (nulls always last).
  const sortedValued = (() => {
    if (!sort) return valued;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (v: typeof valued[number]): number | string | null => {
      switch (sort.key) {
        case "symbol": return v.h.symbol;
        case "shares": return v.h.shares;
        case "avgCost": return v.h.avgCost || null;
        case "price": return v.price;
        case "value": return v.value;
        case "day": return v.daysGainPct;
        case "total": return v.totalGainPct;
        case "weight": return v.value != null && total > 0 ? v.value / total : null;
      }
    };
    return [...valued].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  })();

  // Group rows by symbol so the same stock held in multiple accounts collapses
  // into one summed parent row (expandable). Group order follows the first
  // appearance in the sorted list. A group with a single row renders flat.
  type Valued = typeof valued[number];
  const groupedRows = useMemo(() => {
    const map = new Map<string, Valued[]>();
    for (const v of sortedValued) {
      const arr = map.get(v.h.symbol) ?? [];
      arr.push(v);
      map.set(v.h.symbol, arr);
    }
    return [...map.entries()].map(([symbol, rows]) => {
      const shares = rows.reduce((s, v) => s + v.h.shares, 0);
      const value = rows.reduce((s, v) => s + (v.value ?? 0), 0) || null;
      // Day's gain: prefer each row's $ figure; otherwise derive from its live
      // % × value, so a group of Plaid rows (no $ snapshot) still totals.
      const dayParts = rows.map((v) => v.daysGain ?? (v.daysGainPct != null && v.value != null ? (v.daysGainPct / 100) * v.value : null));
      const daysGain = dayParts.some((d) => d != null) ? dayParts.reduce((s: number, d) => s + (d ?? 0), 0) : null;
      const totalGain = rows.some((v) => v.totalGain != null) ? rows.reduce((s, v) => s + (v.totalGain ?? 0), 0) : null;
      const cost = rows.reduce((s, v) => s + v.h.avgCost * v.h.shares, 0);
      const totalGainPct = totalGain != null && cost > 0 ? (totalGain / cost) * 100 : null;
      // Weighted-average cost across accounts (skip rows with no cost basis).
      const costShares = rows.filter((v) => v.h.avgCost > 0).reduce((s, v) => s + v.h.shares, 0);
      const avgCost = costShares > 0 ? rows.filter((v) => v.h.avgCost > 0).reduce((s, v) => s + v.h.avgCost * v.h.shares, 0) / costShares : null;
      const dayPct = daysGain != null && value != null && value - daysGain !== 0 ? (daysGain / (value - daysGain)) * 100 : null;
      const price = rows.find((v) => v.price != null)?.price ?? null;
      return { symbol, rows, shares, value, daysGain, dayPct, totalGain, totalGainPct, avgCost, price };
    });
  }, [sortedValued]);

  const inputCls = "rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {allHoldings.length === 0 && (
        <ConnectEmptyState variant="invest" />
      )}

      {securities.length > 0 && (
        <>
          {/* Portfolio summary: value, day's gain, total gain */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Portfolio value</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Day&apos;s gain/loss</div>
              <div className={`mt-0.5 text-lg font-semibold ${portDaysGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {portDaysGain >= 0 ? "▲" : "▼"} ${Math.abs(portDaysGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {total - portDaysGain > 0 && (
                  <span className="ml-1 text-sm">({((portDaysGain / (total - portDaysGain)) * 100).toFixed(2)}%)</span>
                )}
              </div>
            </div>
            <div className="glass card-hover rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Total gain/loss</div>
              <div className={`mt-0.5 text-lg font-semibold ${portTotalGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {portTotalGain >= 0 ? "▲" : "▼"} ${Math.abs(portTotalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {total - portTotalGain > 0 && (
                  <span className="ml-1 text-sm">({((portTotalGain / (total - portTotalGain)) * 100).toFixed(1)}%)</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-faint">{holdings.length} position{holdings.length !== 1 ? "s" : ""}</span>
              {syncMsg && (
                <span className={`text-[11px] ${syncMsg.includes("expired") || syncMsg.includes("failed") || syncMsg.includes("Connect") ? "text-rose-400" : "text-ink-faint"}`}>
                  · {syncMsg}
                  {syncMsg.includes("Connectors") && <a href="/connectors" className="ml-1 text-brand-400 underline">Connectors</a>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Subtle refresh — re-syncs the user's connected E*TRADE + live prices */}
              <button
                onClick={() => { syncFromEtrade(); }}
                disabled={syncingEtrade}
                title="Refresh from your connected E*TRADE account"
                className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink disabled:opacity-50">
                <RefreshCw size={12} className={syncingEtrade ? "animate-spin" : ""} />
                {syncingEtrade ? "Syncing…" : "Refresh"}
              </button>
              {anySource && <DataBadge source={anySource} />}
              {/* Source filter — derived from connected institutions, so it
                  scales to any number of banks/brokerages. On phones (and when
                  there are many sources) it's a compact dropdown; on wider
                  screens with a few sources it's a chip row. */}
              {presentSources.length > 1 && (
                <>
                  {/* Chip row: only on sm+ AND when sources are few. */}
                  {presentSources.length <= 3 && (
                    <div className="hidden items-center gap-1 rounded-lg border border-hairline bg-surface p-0.5 sm:flex">
                      {["all", ...presentSources].map((src) => {
                        const label = src === "all" ? "All" : src === "etrade" ? "E*TRADE" : src === "manual" ? "Manual" : src;
                        const active = sourceFilter === src;
                        return (
                          <button
                            key={src}
                            onClick={() => setSourceFilter(src as typeof sourceFilter)}
                            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                              active ? "tab-active" : "text-ink-faint hover:text-ink-dim"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Dropdown: always on phones; on sm+ only when many sources. */}
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                    className={`rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink focus:outline-none ${presentSources.length <= 3 ? "sm:hidden" : ""}`}
                    style={{ background: "var(--surface-solid)", color: "var(--text)" }}
                  >
                    {["all", ...presentSources].map((src) => (
                      <option key={src} value={src}>
                        {src === "all" ? "All sources" : src === "etrade" ? "E*TRADE" : src === "manual" ? "Manual" : src}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {holdings.length === 0 && (
            <div className="rounded-lg border border-hairline bg-surface p-4 text-center text-sm text-ink-faint">
              No {sourceFilter} holdings.
            </div>
          )}

          {holdings.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <Th label="Ticker" k="symbol" sort={sort} onSort={toggleSort} />
                  <th className="px-3 py-2">Trend</th>
                  <Th label="Price" k="price" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Day's gain" k="day" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Value" k="value" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Total gain" k="total" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Shares" k="shares" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Avg cost" k="avgCost" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Weight" k="weight" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {groupedRows.map((g) => {
                  // Single-account symbol (or a filter that matched one account):
                  // render it as a plain row, no collapsing.
                  if (g.rows.length === 1) {
                    return <HoldingRow key={g.rows[0].h.id} v={g.rows[0]} total={total} sparks={sparks} onRemove={removeHolding} />;
                  }
                  // Multiple accounts hold this symbol → summed, collapsible parent.
                  const open = expanded.has(g.symbol);
                  const tUp = (g.totalGain ?? 0) >= 0;
                  const weight = g.value != null && total > 0 ? (g.value / total) * 100 : null;
                  return (
                    <React.Fragment key={`grp-${g.symbol}`}>
                      <tr className="cursor-pointer hover:bg-surface" onClick={() => toggleExpand(g.symbol)} aria-expanded={open}>
                        <td className="px-3 py-2 font-medium">
                          <Link href={`/holdings/${g.symbol}`} onClick={(e) => e.stopPropagation()} className="text-brand-400 hover:underline">{g.symbol}</Link>
                          <span className="ml-1.5 rounded bg-surface-raised px-1 text-[9px] text-ink-faint">{g.rows.length} accounts</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-7 w-16">
                            {(sparks?.[g.symbol]?.length ?? 0) > 1
                              ? <Sparkline data={sparks![g.symbol]} height={28} />
                              : <span className="block pt-2 text-xs text-ink-faint">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-ink-dim">{g.price != null ? `$${g.price.toFixed(2)}` : "—"}</td>
                        <td className={`px-3 py-2 text-right ${g.daysGain == null ? "text-ink-faint" : g.daysGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {g.daysGain == null ? "—" : `${g.daysGain >= 0 ? "▲" : "▼"} $${money(g.daysGain)}${g.dayPct != null ? ` (${Math.abs(g.dayPct).toFixed(2)}%)` : ""}`}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">{g.value != null ? `$${money(g.value)}` : "—"}</td>
                        <td className={`px-3 py-2 text-right ${g.totalGain == null ? "text-ink-faint" : tUp ? "text-emerald-400" : "text-rose-400"}`}>
                          {g.totalGain == null ? "—" : `${tUp ? "▲" : "▼"} $${money(g.totalGain)}${g.totalGainPct != null ? ` (${Math.abs(g.totalGainPct).toFixed(1)}%)` : ""}`}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-dim">{g.shares}</td>
                        <td className="px-3 py-2 text-right text-ink-dim">{g.avgCost != null ? `$${g.avgCost.toFixed(2)}` : "—"}</td>
                        <td className="px-3 py-2 text-right text-ink-dim">{weight != null ? `${weight.toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center justify-end text-ink-faint" title={open ? "Hide accounts" : "Show accounts"}>
                            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </span>
                        </td>
                      </tr>
                      {open && g.rows.map((v) => (
                        <HoldingRow key={v.h.id} v={v} total={total} sparks={sparks} onRemove={removeHolding} child />
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {quotes && <DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} />}
        </>
      )}

      {/* Crypto — separate card; not mixed into the equities table or totals. */}
      {cryptoHoldings.length > 0 && <CryptoCard rows={cryptoHoldings} />}

      {/* Funds & other holdings with no live ticker (mutual funds, CUSIP-only).
          Priced from the broker's value, not researchable by ticker. */}
      {fundHoldings.length > 0 && <FundsCard rows={fundHoldings} />}

      {/* Manual add — secondary, collapsed by default, lives at the bottom.
          Anything manual is not the focus; sync is the primary path. */}
      <div className="rounded-xl border border-hairline bg-surface">
        <button onClick={() => setShowAdd((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-ink-dim hover:text-ink">
          <span className="flex items-center gap-2"><Plus size={14} /> Add a holding manually</span>
          <ChevronDown size={15} className={`transition-transform ${showAdd ? "rotate-180" : ""}`} />
        </button>
        {showAdd && (
          <div className="border-t border-hairline p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              <TickerInput value={symbol} onChange={setSymbol} onSelect={setSymbol} placeholder="Search ticker…" className={`${inputCls} w-full`} />
              <input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" inputMode="decimal" className={inputCls} />
              <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="Avg cost $" inputMode="decimal" className={inputCls} />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
              <button onClick={addHolding} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
                Add holding
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        Saved securely to your account — private to you and synced across devices. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}

// One holding row (leaf). `child` indents it under a collapsible group parent.
function HoldingRow({ v, total, sparks, onRemove, child }: {
  v: { h: Holding; price: number | null; value: number | null; totalGain: number | null; totalGainPct: number | null; daysGain: number | null; daysGainPct: number | null };
  total: number;
  sparks: Record<string, { v: number }[]> | undefined;
  onRemove: (id: string) => void;
  child?: boolean;
}) {
  const { h, price, value, totalGain, totalGainPct, daysGain, daysGainPct } = v;
  const weight = value != null && total > 0 ? (value / total) * 100 : null;
  const tUp = (totalGain ?? 0) >= 0;
  const dUp = (daysGain ?? 0) >= 0;
  return (
    <tr className={child ? "bg-surface/40 hover:bg-surface" : "hover:bg-surface"}>
      <td className={`px-3 py-2 font-medium ${child ? "pl-8" : ""}`}>
        {child
          ? <span className="text-ink-dim">{(h as any).readOnly && h.source ? h.source : h.source === "etrade" ? "E*TRADE" : "Manual"}</span>
          : <Link href={`/holdings/${h.symbol}`} className="text-brand-400 hover:underline">{h.symbol}</Link>}
        {!child && h.source === "etrade" && <span className="ml-1 text-[10px] text-ink-faint">E*T</span>}
        {!child && (h as any).readOnly && h.source && <span className="ml-1 rounded bg-surface-raised px-1 text-[9px] text-ink-faint">{h.source}</span>}
        {h.assetType === "crypto" && <span className="ml-1 rounded bg-lime-500/15 px-1 text-[9px] text-lime-300">CRYPTO</span>}
      </td>
      <td className="px-3 py-2">
        <div className="h-7 w-16">
          {!child && (sparks?.[h.symbol]?.length ?? 0) > 1
            ? <Sparkline data={sparks![h.symbol]} height={28} />
            : <span className="block pt-2 text-xs text-ink-faint">—</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-ink-dim">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
      <td className={`px-3 py-2 text-right ${daysGain == null ? "text-ink-faint" : dUp ? "text-emerald-400" : "text-rose-400"}`}>
        {daysGain == null
          ? (daysGainPct != null ? `${daysGainPct >= 0 ? "▲" : "▼"} ${Math.abs(daysGainPct).toFixed(2)}%` : "—")
          : `${dUp ? "▲" : "▼"} $${money(daysGain)}${daysGainPct != null ? ` (${Math.abs(daysGainPct).toFixed(2)}%)` : ""}`}
      </td>
      <td className="px-3 py-2 text-right text-ink-dim">{value != null ? `$${money(value)}` : "—"}</td>
      <td className={`px-3 py-2 text-right ${totalGain == null || totalGainPct == null ? "text-ink-faint" : tUp ? "text-emerald-400" : "text-rose-400"}`}>
        {totalGain == null || totalGainPct == null ? "—" : `${tUp ? "▲" : "▼"} $${money(totalGain)} (${Math.abs(totalGainPct).toFixed(1)}%)`}
      </td>
      <td className="px-3 py-2 text-right text-ink-dim">{h.shares}</td>
      <td className="px-3 py-2 text-right text-ink-dim">{h.avgCost > 0 ? `$${h.avgCost.toFixed(2)}` : "—"}</td>
      <td className="px-3 py-2 text-right text-ink-dim">{weight != null ? `${weight.toFixed(1)}%` : "—"}</td>
      <td className="px-3 py-2 text-right">
        {/* Only MANUALLY-added holdings can be removed. Synced rows (E*TRADE)
            and Plaid-linked rows are managed by the source, not removable here. */}
        {(h.source ?? "manual") === "manual" && !(h as any).readOnly
          ? <button onClick={() => onRemove(h.id)} className="text-xs text-ink-faint hover:text-rose-300">Remove</button>
          : <Lock size={12} className="ml-auto text-ink-faint/50" aria-label="Synced from your broker — managed by the source" />}
      </td>
    </tr>
  );
}

// Map a crypto holding symbol to FMP's crypto ticker (BTC -> BTCUSD). Leaves
// already-USD-suffixed symbols alone.
function cryptoFmpSymbol(sym: string): string {
  const s = sym.toUpperCase();
  return /USD$/.test(s) ? s : `${s}USD`;
}

// Crypto holdings — own card, with full info (live price, day's gain, value,
// total gain) using FMP's crypto quotes, which are real and free to use.
function CryptoCard({ rows }: { rows: Holding[] }) {
  const fmpSymbols = Array.from(new Set(rows.map((h) => cryptoFmpSymbol(h.symbol))));
  const { data: quotes } = useSWR(
    fmpSymbols.length ? ["crypto-quotes", fmpSymbols.join(",")] : null,
    () => fetchQuotes(fmpSymbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );

  const valued = rows.map((h) => {
    const q = quotes?.[cryptoFmpSymbol(h.symbol)]?.data ?? null;
    const price = q?.price ?? (h as any).plaidPrice ?? null;
    const value = price != null ? price * h.shares : (h.marketValue ?? null);
    const dayPct = q?.changePct ?? null;
    const dayGain = dayPct != null && value != null ? (dayPct / 100) * value : null;
    const cost = h.avgCost > 0 ? h.avgCost * h.shares : null;
    const totalGain = value != null && cost != null ? value - cost : null;
    const totalGainPct = totalGain != null && cost ? (totalGain / cost) * 100 : null;
    return { h, price, value, dayPct, dayGain, totalGain, totalGainPct };
  });
  const total = valued.reduce((s, v) => s + (v.value ?? 0), 0);
  const totalDay = valued.reduce((s, v) => s + (v.dayGain ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="rounded bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-300">CRYPTO</span>
          {rows.length} holding{rows.length !== 1 ? "s" : ""}
        </span>
        <span className="text-right">
          <span className="block text-sm font-semibold text-ink">{total > 0 ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</span>
          {totalDay !== 0 && (
            <span className={`block text-[11px] ${totalDay >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{totalDay >= 0 ? "▲" : "▼"} ${Math.abs(totalDay).toLocaleString(undefined, { maximumFractionDigits: 0 })} today</span>
          )}
        </span>
      </div>
      <div className="overflow-x-auto border-t border-hairline">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Day&apos;s gain</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Total gain</th>
              <th className="px-3 py-2 text-right">Units</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {valued.map(({ h, price, value, dayPct, dayGain, totalGain, totalGainPct }) => (
              <tr key={h.id} className="hover:bg-surface">
                <td className="px-3 py-2 font-medium">
                  {h.symbol}
                  {h.source && h.source !== "manual" && h.source !== "etrade" && <span className="ml-1.5 rounded bg-surface-raised px-1 text-[9px] text-ink-faint">{h.source}</span>}
                </td>
                <td className="px-3 py-2 text-right text-ink-dim">{price != null ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</td>
                <td className={`px-3 py-2 text-right ${dayGain == null ? "text-ink-faint" : dayGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {dayGain == null ? "—" : `${dayGain >= 0 ? "▲" : "▼"} $${Math.abs(dayGain).toFixed(0)}${dayPct != null ? ` (${Math.abs(dayPct).toFixed(2)}%)` : ""}`}
                </td>
                <td className="px-3 py-2 text-right font-medium text-ink">{value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</td>
                <td className={`px-3 py-2 text-right ${totalGain == null ? "text-ink-faint" : totalGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalGain == null ? "—" : `${totalGain >= 0 ? "▲" : "▼"} $${Math.abs(totalGain).toFixed(0)}${totalGainPct != null ? ` (${Math.abs(totalGainPct).toFixed(1)}%)` : ""}`}
                </td>
                <td className="px-3 py-2 text-right text-ink-dim">{h.shares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Funds & other holdings without a live ticker (mutual funds, CUSIP-only).
// Valued from the broker's reported value; no price/research by ticker.
function FundsCard({ rows }: { rows: Holding[] }) {
  const total = rows.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-ink-dim">FUNDS</span>
          {rows.length} holding{rows.length !== 1 ? "s" : ""} without a live ticker
        </span>
        <span className="text-sm font-semibold text-ink">{total > 0 ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</span>
      </div>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {rows.map((h) => (
          <li key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-ink">{(h as any).displayName ?? h.symbol}</span>
              <span className="block text-[11px] text-ink-faint">{h.shares} units{h.source && h.source !== "manual" && h.source !== "etrade" ? ` · ${h.source}` : ""}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-medium text-ink">{h.marketValue != null ? `$${h.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</span>
              {(h as any).plaidPrice != null && <span className="block text-[11px] text-ink-faint">${Number((h as any).plaidPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}/unit</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-3 pt-1 text-[11px] text-ink-faint">Mutual funds and CUSIP-only holdings don&apos;t have a tradeable ticker, so they aren&apos;t priced live or researchable here.</p>
    </div>
  );
}

// Sortable <th>. Click toggles sort on its column; shows an arrow when active.
function Th<K extends string>({
  label, k, sort, onSort, align = "left",
}: {
  label: string;
  k: K;
  sort: { key: K; dir: "asc" | "desc" } | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === k;
  return (
    <th className="px-3 py-2">
      <button
        onClick={() => onSort(k)}
        className={`flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-ink ${active ? "text-brand-300" : ""} ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        {active && (sort!.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}
