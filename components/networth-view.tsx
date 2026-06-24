"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Trash2, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";

interface Item { source: string; label: string; type: string; kind: "asset" | "liability"; amount: number; liquid: boolean }
interface TrendPt { month: string; netWorth: number; assets: number; liabilities: number }
interface NetWorth {
  asOf: string; totalAssets: number; totalLiabilities: number; netWorth: number;
  liquid: number; illiquid: number; byType: Record<string, number>;
  items: Item[]; excluded: string[]; trend: TrendPt[];
  changeAmount: number | null; changePct: number | null;
}
interface ManualItem { id: string; name: string; kind: string; type: string; value: number; notes: string | null }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const TYPE_LABEL: Record<string, string> = {
  cash: "Cash", investment: "Investments", retirement: "Retirement", real_estate: "Real estate",
  vehicle: "Vehicles", other_asset: "Other assets", credit_card: "Credit cards", mortgage: "Mortgage",
  loan: "Loans", other_liability: "Other debts",
};
const ASSET_TYPES = ["cash", "investment", "retirement", "real_estate", "vehicle", "other_asset"];
const LIABILITY_TYPES = ["credit_card", "mortgage", "loan", "other_liability"];

const RANGES: { label: string; months: number }[] = [
  { label: "3M", months: 3 }, { label: "6M", months: 6 }, { label: "1Y", months: 12 }, { label: "All", months: 0 },
];

export function NetWorthView() {
  const { data, isLoading, mutate } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false });
  const { data: manual, mutate: mutateManual } = useSWR<{ items: ManualItem[] }>("/api/manual-items", fetchJson, { revalidateOnFocus: false });
  const [range, setRange] = useState(12);
  const [showAdd, setShowAdd] = useState(false);

  const trend = useMemo(() => {
    const t = data?.trend ?? [];
    return range === 0 ? t : t.slice(-range);
  }, [data, range]);

  if (isLoading && !data) return <div className="h-64 animate-pulse rounded-2xl bg-surface-raised" />;

  const assetTypes = Object.entries(data?.byType ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const liabilityTypes = Object.entries(data?.byType ?? {}).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const hasData = (data?.totalAssets ?? 0) > 0 || (data?.totalLiabilities ?? 0) > 0;

  const liquidPct = data && (data.liquid + data.illiquid) > 0 ? Math.round((data.liquid / (data.liquid + data.illiquid)) * 100) : 0;

  // Computed insight (math here, not the AI).
  const insight = (() => {
    if (!data || !hasData) return "";
    if (data.changeAmount != null && Math.abs(data.changeAmount) > 0) {
      const dir = data.changeAmount >= 0 ? "up" : "down";
      return `Net worth ${dir} ${money(Math.abs(data.changeAmount))} this month${data.changePct != null ? ` (${data.changePct >= 0 ? "+" : ""}${data.changePct}%)` : ""}.`;
    }
    if (liquidPct < 25) return `${100 - liquidPct}% of your assets are illiquid — your liquid cushion is ${money(data.liquid)}.`;
    return `You have ${money(data.liquid)} in liquid assets you can access now.`;
  })();

  async function deleteManual(id: string) {
    await fetch(`/api/manual-items?id=${id}`, { method: "DELETE" });
    await Promise.all([mutateManual(), mutate()]);
  }

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div className="rounded-2xl glass p-5">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">Net worth</div>
        <div className="mt-1 text-3xl font-bold text-ink md:text-4xl">{money(data?.netWorth ?? 0)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-ink-dim">Assets <span className="font-medium text-emerald-400">{money(data?.totalAssets ?? 0)}</span></span>
          <span className="text-ink-dim">Liabilities <span className="font-medium text-rose-400">{money(data?.totalLiabilities ?? 0)}</span></span>
          {data?.changeAmount != null && (
            <span className={`inline-flex items-center gap-1 ${data.changeAmount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {data.changeAmount >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              {money(Math.abs(data.changeAmount))}{data.changePct != null ? ` (${Math.abs(data.changePct)}%)` : ""} this month
            </span>
          )}
        </div>

        {/* Trend */}
        {trend.length > 1 ? (
          <>
            <div className="mt-4 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16D27E" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#16D27E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: number) => money(v)}
                    contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                  <Area type="monotone" dataKey="netWorth" stroke="#16D27E" strokeWidth={2} fill="url(#nwGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {RANGES.map((r) => (
                <button key={r.label} onClick={() => setRange(r.months)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] ${range === r.months ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-[11px] text-ink-faint">Your net-worth trend builds month over month — check back as time passes.</p>
        )}

        {insight && <p className="mt-3 text-sm text-ink-dim">{insight} <span className="text-ink-faint">Not financial advice.</span></p>}
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          Nothing to total yet. <Link href="/settings" className="text-brand-400 underline">Connect an institution</Link> or add a manual item below.
        </div>
      )}

      {/* Excluded accounts warning */}
      {data?.excluded && data.excluded.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Some balances were unavailable and excluded from totals: {data.excluded.join(", ")}.</span>
        </div>
      )}

      {/* Liquid vs illiquid */}
      {hasData && (
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Liquid vs illiquid</div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full bg-brand-500" style={{ width: `${liquidPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-ink-dim">Liquid (accessible now) <span className="font-medium text-ink">{money(data!.liquid)}</span></span>
            <span className="text-ink-dim">Illiquid <span className="font-medium text-ink">{money(data!.illiquid)}</span></span>
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {assetTypes.length > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-emerald-300">Assets by type</div>
            <ul className="mt-3 space-y-2">
              {assetTypes.map(([t, v]) => (
                <li key={t} className="flex items-center justify-between text-sm">
                  <span className="text-ink-dim">{TYPE_LABEL[t] ?? t}</span>
                  <span className="font-medium text-ink">{money(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {liabilityTypes.length > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-rose-300">Liabilities by type</div>
            <ul className="mt-3 space-y-2">
              {liabilityTypes.map(([t, v]) => (
                <li key={t} className="flex items-center justify-between text-sm">
                  <span className="text-ink-dim">{TYPE_LABEL[t] ?? t}</span>
                  <span className="font-medium text-ink">{money(Math.abs(v))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Accounts + manual items */}
      <div className="rounded-2xl glass p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">All accounts &amp; items</div>
          <button onClick={() => setShowAdd((s) => !s)} className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink">
            <Plus size={12} /> Add manual item
          </button>
        </div>

        {showAdd && <AddManualForm onAdded={async () => { setShowAdd(false); await Promise.all([mutateManual(), mutate()]); }} />}

        <ul className="mt-3 divide-y divide-hairline">
          {(data?.items ?? []).filter((i) => i.source !== "manual").map((it, i) => (
            <li key={`c${i}`} className="flex items-center justify-between py-2 text-sm">
              <span className="min-w-0 truncate text-ink-dim">{it.label} <span className="text-[10px] text-ink-faint">· {TYPE_LABEL[it.type] ?? it.type}</span></span>
              <span className={`shrink-0 font-medium ${it.kind === "liability" ? "text-rose-400" : "text-ink"}`}>{it.kind === "liability" ? "−" : ""}{money(it.amount)}</span>
            </li>
          ))}
          {(manual?.items ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span className="min-w-0 truncate text-ink-dim">
                {m.name} <span className="text-[10px] text-ink-faint">· {TYPE_LABEL[m.type] ?? m.type} · manual</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`font-medium ${m.kind === "liability" ? "text-rose-400" : "text-ink"}`}>{m.kind === "liability" ? "−" : ""}{money(Number(m.value))}</span>
                <button onClick={() => deleteManual(m.id)} className="text-ink-faint hover:text-rose-400"><Trash2 size={13} /></button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-ink-faint">
        Combines your linked institutions (banks, brokerages, retirement, loans) via Plaid, live-priced
        holdings, and your manual items. Computed from real balances. Not financial advice.
      </p>
    </div>
  );
}

function AddManualForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"asset" | "liability">("asset");
  const [type, setType] = useState("real_estate");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const types = kind === "asset" ? ASSET_TYPES : LIABILITY_TYPES;

  async function submit() {
    const v = Number(value);
    if (!name.trim() || !Number.isFinite(v) || v < 0) return;
    setBusy(true);
    try {
      await fetch("/api/manual-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), kind, type, value: v }) });
      onAdded();
    } finally { setBusy(false); }
  }

  const input = "rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";
  const select = "rounded-md border border-hairline px-3 py-2 text-sm text-ink focus:outline-none";

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-hairline bg-surface p-3 sm:grid-cols-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. House, Car loan)" className={input} />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value $" inputMode="decimal" className={input} />
      <select value={kind} onChange={(e) => { const k = e.target.value as "asset" | "liability"; setKind(k); setType(k === "asset" ? "real_estate" : "loan"); }}
        className={select} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
        <option value="asset">Asset</option>
        <option value="liability">Liability</option>
      </select>
      <select value={type} onChange={(e) => setType(e.target.value)} className={select} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
        {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
      </select>
      <div className="sm:col-span-2">
        <button onClick={submit} disabled={busy} className="btn-gold rounded-md px-4 py-2 text-sm disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
      </div>
    </div>
  );
}
