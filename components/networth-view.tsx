"use client";

import useSWR from "swr";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Row { label: string; kind: "asset" | "debt"; amount: number; source: string }
interface NetWorth {
  assets: number; debts: number; net: number;
  breakdown: Row[];
  trend: { date: string; net: number; assets: number; debts: number }[];
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function NetWorthView() {
  const { data, isLoading } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false });

  if (isLoading && !data) return <div className="h-64 animate-pulse rounded-2xl bg-surface-raised" />;

  const assets = data?.breakdown.filter((b) => b.kind === "asset") ?? [];
  const debts = data?.breakdown.filter((b) => b.kind === "debt") ?? [];
  const hasData = (data?.breakdown.length ?? 0) > 0;
  const trend = data?.trend ?? [];

  return (
    <div className="space-y-5">
      {/* Net worth hero */}
      <div className="rounded-2xl glass p-5">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">Net worth</div>
        <div className="mt-1 text-3xl font-bold text-ink md:text-4xl">{money(data?.net ?? 0)}</div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-dim">Assets <span className="font-medium text-emerald-400">{money(data?.assets ?? 0)}</span></span>
          <span className="text-ink-dim">Debts <span className="font-medium text-rose-400">{money(data?.debts ?? 0)}</span></span>
        </div>

        {trend.length > 1 && (
          <div className="mt-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16D27E" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#16D27E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip formatter={(v: number) => money(v)} labelFormatter={(l) => l}
                  contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                <Area type="monotone" dataKey="net" stroke="#16D27E" strokeWidth={2} fill="url(#nwGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {trend.length <= 1 && (
          <p className="mt-3 text-[11px] text-ink-faint">Your net-worth trend builds over time — check back daily.</p>
        )}
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          Nothing to total yet. <Link href="/settings" className="text-brand-400 underline">Connect a bank</Link> or add holdings to see your net worth.
        </div>
      )}

      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {assets.length > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-emerald-300">Assets</div>
            <ul className="mt-3 space-y-2">
              {assets.map((b, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink-dim">{b.label}</span>
                  <span className="shrink-0 font-medium text-ink">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {debts.length > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-rose-300">Debts</div>
            <ul className="mt-3 space-y-2">
              {debts.map((b, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink-dim">{b.label}</span>
                  <span className="shrink-0 font-medium text-ink">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        Combines your linked banks, cards, and brokerages (via Plaid), your manual / E*TRADE holdings
        (live-priced), and your cash. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
