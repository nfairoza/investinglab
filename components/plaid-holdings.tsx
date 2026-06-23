"use client";

import useSWR from "swr";

interface Holding {
  symbol: string; name: string | null; quantity: number;
  price: number | null; value: number | null; costBasis: number | null;
  currency: string; institution: string | null;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

// Investment holdings from Plaid-linked brokerages/retirement accounts, shown
// alongside the manual/E*TRADE holdings above. Read-only.
export function PlaidHoldings() {
  const { data } = useSWR<{ holdings: Holding[]; configured?: boolean }>("/api/plaid/holdings", fetchJson, { revalidateOnFocus: false });
  const holdings = data?.holdings ?? [];
  if (!holdings.length) return null; // nothing connected → don't clutter the page

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 text-sm font-semibold text-ink">Linked brokerage holdings (via Plaid)</div>
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
    </div>
  );
}
