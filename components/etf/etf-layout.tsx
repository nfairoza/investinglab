"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { Term } from "@/components/term";
import { PriceChart } from "@/components/charts/PriceChart";
import type { EtfPayload } from "@/app/api/etf/route";

// E2 — the ETF layout, shown in place of company-financials sections when a symbol
// is an ETF. Every dataset is probe-and-remember at the API; a plan-tiered one
// renders an honest plan-notice card instead of an empty section.
export function EtfLayout({ symbol, name }: { symbol: string; name?: string | null }) {
  const { data } = useSWR<EtfPayload>(
    `/api/etf?symbol=${encodeURIComponent(symbol)}${name ? `&name=${encodeURIComponent(name)}` : ""}`,
    fetchJson,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (!data) {
    return <div className="rounded-xl glass p-6 text-sm text-ink-faint">Loading fund details…</div>;
  }

  const lev = data.leverage;
  const swap = data.swap;

  return (
    <div className="space-y-4">
      {/* Leveraged/inverse education banner (E2) — prominent but non-alarmist. */}
      {lev.leveraged && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="text-sm text-ink-dim">
              <span className="font-semibold text-ink">{lev.label} fund</span> — resets daily; returns over
              longer periods can differ sharply from {Math.abs(lev.factor)}× the index (
              <Term id="volatility_decay">volatility decay</Term>). Designed for short-term positioning, not
              buy-and-hold.
            </div>
          </div>
        </div>
      )}

      {/* Key facts strip (E2) */}
      <div className="rounded-xl glass p-4">
        <div className="text-sm font-semibold text-ink">Fund facts</div>
        {data.info.data ? (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact
              label="Expense ratio"
              value={data.info.data.expenseRatio != null ? `${(data.info.data.expenseRatio * 100).toFixed(2)}%` : "—"}
              hint={data.info.data.expenseRatio != null ? `$${Math.round(data.info.data.expenseRatio * 10000)}/yr per $10k invested` : undefined}
            />
            <Fact label="AUM" value={fmtAum(data.info.data.aum)} />
            <Fact label="Inception" value={data.info.data.inceptionDate ?? "—"} />
            <Fact label="Issuer" value={data.info.data.etfCompany ?? "—"} />
          </div>
        ) : (
          <PlanNotice note={data.info.note} />
        )}
      </div>

      {/* Price chart (reuse chart-theme) */}
      <div className="rounded-xl glass p-4">
        <div className="mb-2 text-sm font-semibold text-ink">Price</div>
        <PriceChart symbol={symbol} />
      </div>

      {/* Swap-based fund note (E2): when holdings are dominated by swaps/cash, don't
          list swap contracts as if they were stocks. */}
      {swap.swapBased && (
        <div className="rounded-xl border border-hairline bg-surface p-4 text-sm text-ink-dim">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-brand-400" />
            <div>
              <span className="font-medium text-ink">Exposure via swaps.</span> This fund gets its exposure
              through total-return swaps and collateral rather than holding the underlying stocks directly
              ({swap.equityWeight.toFixed(0)}% of holdings are equities). We show its sector composition below
              rather than a confusing list of swap contracts.
            </div>
          </div>
        </div>
      )}

      {/* Top holdings (E2) — top 10 with weight bars, unless swap-dominated. */}
      {!swap.swapBased && (
        <TopHoldings symbol={symbol} data={data} />
      )}

      {/* Sector + country weights (E2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl glass p-4">
          <div className="mb-2 text-sm font-semibold text-ink">Sector weights</div>
          {data.sectors.data && data.sectors.data.length > 0 ? (
            <AllocationDonut
              title=""
              slices={data.sectors.data.map((s) => ({ symbol: s.label, value: s.weight }))}
            />
          ) : (
            <PlanNotice note={data.sectors.note} />
          )}
        </div>
        <div className="rounded-xl glass p-4">
          <div className="mb-2 text-sm font-semibold text-ink">Country weights</div>
          {data.countries.data && data.countries.data.length > 0 ? (
            <AllocationDonut
              title=""
              slices={data.countries.data.map((c) => ({ symbol: c.label, value: c.weight }))}
            />
          ) : (
            <PlanNotice note={data.countries.note} />
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-faint">
        Fund data as of {new Date(data.generatedAt).toLocaleString()} · refreshed daily · educational, not advice.
      </p>
    </div>
  );
}

function TopHoldings({ symbol, data }: { symbol: string; data: EtfPayload }) {
  const [expanded, setExpanded] = useState(false);
  const holdings = data.holdings.data;
  if (!holdings || holdings.length === 0) {
    return (
      <div className="rounded-xl glass p-4">
        <div className="mb-2 text-sm font-semibold text-ink">Top holdings</div>
        <PlanNotice note={data.holdings.note} />
      </div>
    );
  }
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const shown = expanded ? sorted : sorted.slice(0, 10);
  const maxW = sorted[0]?.weight || 1;

  return (
    <div className="rounded-xl glass p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-ink">Top holdings</div>
        <div className="text-[11px] text-ink-faint">
          {shown.length} of {sorted.length} shown
        </div>
      </div>
      <div className="space-y-2">
        {shown.map((h, i) => (
          <div key={`${h.symbol ?? h.name}-${i}`} className="flex items-center gap-3">
            <div className="w-16 shrink-0 text-xs font-mono">
              {h.symbol
                ? <Link href={`/research?symbol=${h.symbol}`} className="text-brand-300 hover:underline">{h.symbol}</Link>
                : <span className="text-ink-faint">—</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 truncate text-xs text-ink-dim">{h.name ?? h.symbol ?? "—"}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (h.weight / maxW) * 100)}%` }} />
              </div>
            </div>
            <div className="w-14 shrink-0 text-right font-mono text-xs text-ink">{h.weight.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      {sorted.length > 10 && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-3 text-xs text-brand-300 hover:underline">
          {expanded ? "Show top 10" : `Full list (${sorted.length})`}
        </button>
      )}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-ink" title={hint}>{value}</div>
      {hint && <div className="text-[10px] text-ink-faint">{hint}</div>}
    </div>
  );
}

function PlanNotice({ note }: { note?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-4 text-xs text-ink-faint">
      <Info size={14} className="shrink-0" />
      {note === "not available on current data plan"
        ? "Not available on the current data plan."
        : (note ?? "Not available right now.")}
    </div>
  );
}

function fmtAum(aum: number | null): string {
  if (aum == null) return "—";
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(1)}T`;
  if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`;
  if (aum >= 1e6) return `$${(aum / 1e6).toFixed(0)}M`;
  return `$${aum.toLocaleString()}`;
}
