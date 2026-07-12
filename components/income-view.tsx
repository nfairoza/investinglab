"use client";

import useSWR from "swr";
import { Coins, CalendarClock } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ArtImage } from "./ui/art-image";
import { ResponsiveTable } from "./ui/responsive-table";

interface Position {
  symbol: string; shares: number; price: number | null; annualPerShare: number;
  projectedAnnualIncome: number; forwardYield: number | null; yieldOnCost: number | null; nextExDate: string | null;
}
interface IncomeResp {
  positions: Position[];
  totals: { projectedAnnualIncome: number; thisMonthExpected: number };
  calendar: { month: string; amount: number }[];
  asOf?: string;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);

// F4 — dividend & income sub-tab under Portfolio.
export function IncomeView() {
  const { data, isLoading } = useSWR<IncomeResp>("/api/income", fetchJson, { revalidateOnFocus: false });

  if (isLoading) return <div className="rounded-2xl glass p-6 text-sm text-ink-faint">Loading your income…</div>;
  const positions = data?.positions ?? [];

  if (positions.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl glass p-8 text-center">
        <ArtImage name="persona-money" alt="" className="mx-auto mb-3 h-28 w-auto rounded-xl opacity-95" sizes="320px" />
        <h2 className="text-lg font-semibold text-ink">No dividend income yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          When you hold dividend-paying stocks or ETFs, your projected annual income, yield, and payout
          calendar will appear here.
        </p>
      </div>
    );
  }

  const maxMonth = Math.max(...(data?.calendar ?? []).map((c) => c.amount), 1);

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl glass p-4">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint"><Coins size={12} className="text-brand-400" /> Projected annual income</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">{money(data!.totals.projectedAnnualIncome)}</div>
        </div>
        <div className="rounded-2xl glass p-4">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint"><CalendarClock size={12} className="text-brand-400" /> Expected this month</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">{money(data!.totals.thisMonthExpected)}</div>
        </div>
      </div>

      {/* Payout calendar (projection) */}
      <div className="rounded-2xl glass p-4">
        <div className="mb-3 text-sm font-semibold text-ink">Payout calendar <span className="font-normal text-ink-faint">· projected, even-split</span></div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {(data?.calendar ?? []).map((c) => (
            <div key={c.month} className="text-center">
              <div className="mx-auto flex h-16 w-full items-end justify-center">
                <div className="w-4 rounded-t bg-brand-500/60" style={{ height: `${Math.max(4, (c.amount / maxMonth) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-ink-faint">{c.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-position table (cards on mobile) */}
      <ResponsiveTable
        rows={positions}
        rowKey={(p) => p.symbol}
        columns={[
          { key: "sym", header: "Symbol", cell: (p) => <span className="font-medium text-ink">{p.symbol}</span> },
          { key: "inc", header: "Annual income", align: "right", cell: (p) => <span className="text-ink">{money(p.projectedAnnualIncome)}</span> },
          { key: "fyld", header: "Fwd yield", align: "right", cell: (p) => <span className="text-ink-dim">{pct(p.forwardYield)}</span> },
          { key: "yoc", header: "Yield on cost", align: "right", cell: (p) => <span className="text-ink-dim" title={p.yieldOnCost == null ? "No cost basis available for this position" : undefined}>{pct(p.yieldOnCost)}</span> },
          { key: "exdiv", header: "Next ex-div", cell: (p) => <span className="text-[11px] text-ink-faint">{p.nextExDate ?? "—"}</span> },
        ]}
        card={(p) => ({
          title: p.symbol,
          value: money(p.projectedAnnualIncome),
          meta: `${pct(p.forwardYield)} yield · YoC ${pct(p.yieldOnCost)}${p.nextExDate ? ` · ex-div ${p.nextExDate}` : ""}`,
        })}
      />
      <p className="text-[11px] text-ink-faint">
        Figures use trailing-12-month dividends from FMP{data?.asOf ? ` · as of ${new Date(data.asOf).toLocaleDateString()}` : ""}. Projected income and the
        payout calendar are estimates, not guaranteed. Positions without cost basis show &ldquo;—&rdquo; for yield on cost.
      </p>
    </div>
  );
}

// Compact summary for embedding elsewhere (e.g. Portfolio header).
export function IncomeSummary() {
  const { data } = useSWR<IncomeResp>("/api/income", fetchJson, { revalidateOnFocus: false });
  if (!data || data.totals.projectedAnnualIncome <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-dim">
      <Coins size={14} className="text-brand-400" /> {money(data.totals.projectedAnnualIncome)}/yr projected income
    </span>
  );
}
