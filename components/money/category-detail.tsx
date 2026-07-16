"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { ArrowLeft } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { categoryStyle } from "@/lib/categories";
import { MerchantIcon } from "./merchant-icon";

// Category detail — tapping a category anywhere lands here. Header (icon + this
// month's total), MV2 target progress ring when a target exists, a 6-month mini
// bar chart, a stat row (total / count / average), then the filtered transaction
// list with merchant icons. The list IS the evidence (honest by construction).
interface Txn { id: string; date: string; name: string; merchant: string | null; logoUrl: string | null; amount: number; category: string; isTransfer: boolean; excluded: boolean }
interface TargetRow { category: string; target: number; spent: number; pace: "ahead" | "on" | "behind"; expectedByNow: number }

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" });

export function CategoryDetail({ category }: { category: string }) {
  const { data: txnData } = useSWR<{ transactions: Txn[] }>("/api/plaid/transactions?sync=0", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: targetData } = useSWR<{ targets: TargetRow[] }>("/api/money/targets", fetchJson, { revalidateOnFocus: false });
  const { icon: Icon, color } = categoryStyle(category);

  const stats = useMemo(() => {
    const all = (txnData?.transactions ?? []).filter((t) => t.category === category && !t.isTransfer && !t.excluded && t.amount > 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const cur = all.filter((t) => monthKey(t.date) === thisMonth);
    const total = cur.reduce((s, t) => s + t.amount, 0);
    // 6-month history.
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
    const byMonth = new Map(months.map((m) => [m, 0]));
    for (const t of all) { const k = monthKey(t.date); if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + t.amount); }
    const history = months.map((m) => ({ month: m, label: monthLabel(m), value: Math.round(byMonth.get(m) ?? 0), current: m === thisMonth }));
    return { rows: cur.sort((a, b) => b.date.localeCompare(a.date)), total, count: cur.length, avg: cur.length ? total / cur.length : 0, history };
  }, [txnData, category]);

  const target = targetData?.targets.find((t) => t.category === category) ?? null;

  return (
    <div className="space-y-5">
      <Link href="/spending" className="inline-flex items-center gap-1.5 text-xs text-ink-dim hover:text-ink"><ArrowLeft size={14} /> Back to spending</Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${color}22` }}>
          <Icon size={22} style={{ color }} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{category}</h1>
          <p className="text-sm text-ink-dim">{money(stats.total)} this month</p>
        </div>
      </div>

      {/* Target ring + 6-month history */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {target && <TargetRing target={target} color={color} />}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="text-sm font-semibold text-ink">Last 6 months</div>
          <div className="mt-2 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {stats.history.map((h, i) => <Cell key={i} fill={color} opacity={h.current ? 1 : 0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="This month" value={money(stats.total)} />
        <Stat label="Transactions" value={String(stats.count)} />
        <Stat label="Average" value={money(stats.avg)} />
      </div>

      {/* Filtered transaction list (the evidence). */}
      <div className="rounded-2xl border border-hairline bg-surface p-4">
        <div className="text-sm font-semibold text-ink">Transactions this month</div>
        {stats.rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No {category} transactions this month.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5">
            {stats.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <MerchantIcon logoUrl={t.logoUrl} merchant={t.merchant || t.name} category={category} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.merchant || t.name}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-medium text-ink">{money(t.amount)}</span>
                  <span className="block text-[11px] text-ink-faint">{t.date}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TargetRing({ target, color }: { target: TargetRow; color: string }) {
  const pct = target.target > 0 ? Math.min(100, Math.round((target.spent / target.target) * 100)) : 0;
  const over = target.spent > target.target;
  const remaining = target.target - target.spent;
  const r = 34, circ = 2 * Math.PI * r;
  const ringColor = over ? "#FB7185" : target.pace === "ahead" ? "#FBBF24" : color;
  const paceLabel = { ahead: "over pace", on: "on pace", behind: "under pace" }[target.pace];
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-4">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 88 88" className="h-24 w-24 -rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--hairline)" strokeWidth="8" />
          <circle cx="44" cy="44" r={r} fill="none" stroke={ringColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, target.spent / (target.target || 1)))} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">{pct}%</div>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{money(target.spent)} of {money(target.target)}</div>
        <div className={`text-xs ${over ? "text-rose-300" : "text-ink-dim"}`}>{over ? `${money(-remaining)} over` : `${money(remaining)} left`}</div>
        <div className="mt-1 text-[11px] text-ink-faint">● {paceLabel} for the month</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 font-semibold text-ink">{value}</div>
    </div>
  );
}
