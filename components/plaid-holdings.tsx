"use client";

import useSWR from "swr";
import { fetchJson } from "@/lib/fetch-json";
import { ErrorState } from "./data-state";
import { Skeleton, EmptyState } from "./ui/primitives";

interface Holding {
  symbol: string; name: string | null; quantity: number;
  price: number | null; value: number | null; costBasis: number | null;
  currency: string; institution: string | null;
}

const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

// Investment holdings from Plaid-linked brokerages/retirement accounts, shown
// alongside the manual/E*TRADE holdings above. Read-only. Explicit loading /
// empty / error states — no silent null (see P0.2).
export function PlaidHoldings() {
  const { data, error, isLoading, mutate } = useSWR<{ holdings: Holding[]; configured?: boolean }>(
    "/api/plaid/investments",
    fetchJson,
    { revalidateOnFocus: false },
  );
  const holdings = data?.holdings ?? [];

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 text-sm font-semibold text-ink">Linked brokerage holdings (via Plaid)</div>
      {children}
    </div>
  );

  if (isLoading) {
    return <Shell><div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div></Shell>;
  }
  if (error) {
    return <Shell><ErrorState error={error} onRetry={() => mutate()} /></Shell>;
  }
  if (!holdings.length) {
    return (
      <Shell>
        <EmptyState title="No linked brokerage accounts yet." hint="Connect a brokerage to see its holdings here." action={
          <a href="/accounts" className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20">Connect an account</a>
        } />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Gain</th>
              <th className="px-3 py-2">Account</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const gain = h.value != null && h.costBasis != null ? h.value - h.costBasis : null;
              return (
                <tr key={`${h.symbol}-${i}`} className="border-t border-hairline">
                  <td className="px-3 py-2 font-medium text-ink">{h.symbol}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{h.quantity}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{money(h.price, h.currency)}</td>
                  <td className="px-3 py-2 text-right text-ink">{money(h.value, h.currency)}</td>
                  <td className={`px-3 py-2 text-right ${gain == null ? "text-ink-faint" : gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {gain == null ? "—" : `${gain >= 0 ? "▲" : "▼"} ${money(Math.abs(gain), h.currency)}`}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{h.institution ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
