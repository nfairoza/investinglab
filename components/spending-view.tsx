"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Txn {
  id: string; date: string; name: string; merchant: string | null;
  amount: number; currency: string; category: string; institution: string | null;
  pending: boolean; isTransfer: boolean; excluded: boolean;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const COLORS = ["#16D27E", "#0EA6C9", "#11B4AE", "#34E0A1", "#60A5FA", "#F59E0B", "#FB7185", "#FBBF24", "#A78BFA", "#22D3EE"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

type PresetKey = "thisMonth" | "lastMonth" | "30d" | "90d" | "ytd" | "custom";

// Resolve a preset to a {from, to} YYYY-MM-DD range (client-side only).
function presetRange(key: Exclude<PresetKey, "custom">): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  switch (key) {
    case "thisMonth": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: iso(d), to }; }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90); return { from: iso(d), to }; }
    case "ytd": return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
  }
}

const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "YTD" },
];

export function SpendingView() {
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { data, isLoading } = useSWR<{ transactions: Txn[]; configured?: boolean }>(
    "/api/plaid/transactions", fetchJson, { revalidateOnFocus: false },
  );

  const txns = data?.transactions ?? [];

  const range = useMemo(() => {
    if (preset === "custom") return { from: customFrom || "0000-00-00", to: customTo || "9999-12-31" };
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const stats = useMemo(() => {
    const { from, to } = range;
    // Plaid convention: positive amount = money out (expense), negative = money in.
    const inPeriod = txns.filter((t) => t.date >= from && t.date <= to && !t.excluded && !t.isTransfer);
    let income = 0, expenses = 0;
    const byCat = new Map<string, number>();
    const byMerchant = new Map<string, number>();
    for (const t of inPeriod) {
      if (t.amount < 0) income += -t.amount;
      else {
        expenses += t.amount;
        byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
        const m = t.merchant ?? t.name;
        byMerchant.set(m, (byMerchant.get(m) ?? 0) + t.amount);
      }
    }
    const cats = [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const merchants = [...byMerchant.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    return { income, expenses, net: income - expenses, cats, merchants, count: inPeriod.length };
  }, [txns, range]);

  if (data?.configured === false) {
    return <Empty>Bank connections aren&apos;t available yet.</Empty>;
  }
  if (!isLoading && txns.length === 0) {
    return <Empty>No spending data yet. <Link href="/settings" className="text-brand-400 underline">Connect a bank</Link> to see your spending here.</Empty>;
  }

  return (
    <div className="space-y-5">
      {/* Period selector: presets + custom range */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${preset === p.key ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"}`}>
            {p.label}
          </button>
        ))}
        <button onClick={() => setPreset("custom")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${preset === "custom" ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"}`}>
          Custom
        </button>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-ink focus:outline-none" style={{ background: "var(--surface-solid)", color: "var(--text)" }} />
            <span className="text-xs text-ink-faint">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-ink focus:outline-none" style={{ background: "var(--surface-solid)", color: "var(--text)" }} />
          </div>
        )}
      </div>

      {/* Income / expenses / net */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Income" value={money(stats.income)} tone="emerald" />
        <Stat label="Expenses" value={money(stats.expenses)} tone="rose" />
        <Stat label="Net" value={money(stats.net)} tone={stats.net >= 0 ? "emerald" : "rose"} />
      </div>

      {/* By category donut + list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Spending by category</div>
          {stats.cats.length === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">No expenses in this period.</p>
          ) : (
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.cats} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {stats.cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg)" />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Top categories</div>
          <ul className="mt-3 space-y-2">
            {stats.cats.slice(0, 6).map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1 truncate text-ink-dim">{c.name}</span>
                <span className="shrink-0 font-medium text-ink">{money(c.value)}</span>
              </li>
            ))}
            {stats.cats.length === 0 && <li className="text-sm text-ink-faint">—</li>}
          </ul>
        </div>
      </div>

      {/* Top merchants */}
      <div className="rounded-2xl glass p-5">
        <div className="text-sm font-semibold text-ink">Top merchants</div>
        <ul className="mt-3 space-y-2">
          {stats.merchants.map((m) => (
            <li key={m.name} className="flex items-center justify-between text-sm">
              <span className="truncate text-ink-dim">{m.name}</span>
              <span className="shrink-0 font-medium text-ink">{money(m.value)}</span>
            </li>
          ))}
          {stats.merchants.length === 0 && <li className="text-sm text-ink-faint">—</li>}
        </ul>
      </div>

      <p className="text-[11px] text-ink-faint">
        Based on your linked accounts from {range.from} to {range.to}. Transfers and excluded transactions are not counted.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" }) {
  return (
    <div className="rounded-xl glass p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${tone === "emerald" ? "text-emerald-400" : "text-rose-400"}`}>{value}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">{children}</div>;
}
