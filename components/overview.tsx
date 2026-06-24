"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown, Plus, Scale, TrendingUp, Landmark, PiggyBank, Sparkles } from "lucide-react";

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface NetWorth { netWorth: number; totalAssets: number; totalLiabilities: number; byType: Record<string, number>; changeAmount: number | null; changePct: number | null; items: { type: string; kind: string; amount: number }[] }
interface Balances { totalCash: number; items: { accounts: { type: string; current: number | null }[] }[] }
interface Txn { date: string; amount: number; category: string; isTransfer: boolean; excluded: boolean }
interface Holding { symbol: string; shares: number; marketValue?: number; daysGain?: number }

function CardShell({ title, href, cta, children, className = "" }: { title: string; href?: string; cta?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl glass p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {href && <Link href={href} className="inline-flex items-center gap-1 text-xs text-brand-400 hover:underline">{cta ?? "View"} <ArrowRight size={12} /></Link>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function Overview() {
  const { data: nw } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false });
  const { data: bal } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false });
  const { data: txnData } = useSWR<{ transactions: Txn[] }>("/api/plaid/transactions?sync=0", fetchJson, { revalidateOnFocus: false });
  const { data: holdings } = useSWR<Holding[]>("/api/holdings", fetchJson, { revalidateOnFocus: false });

  // Investments value + day change from holdings.
  const inv = useMemo(() => {
    const list = holdings ?? [];
    let value = 0, day = 0;
    for (const h of list) { value += h.marketValue ?? 0; day += h.daysGain ?? 0; }
    return { value, day, count: list.length };
  }, [holdings]);

  // Retirement from net-worth byType.
  const retirement = nw?.byType?.retirement ?? 0;

  // This-month income vs expenses from cached transactions.
  const spend = useMemo(() => {
    const list = txnData?.transactions ?? [];
    const since = new Date(); since.setDate(1);
    const from = since.toISOString().slice(0, 10);
    let income = 0, expense = 0;
    const cats = new Map<string, number>();
    for (const t of list) {
      if (t.date < from || t.excluded || t.isTransfer) continue;
      if (t.amount < 0) income += -t.amount;
      else { expense += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
    }
    const top = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { income, expense, net: income - expense, top };
  }, [txnData]);

  const nothingConnected = (nw?.totalAssets ?? 0) === 0 && (nw?.totalLiabilities ?? 0) === 0 && inv.count === 0;

  if (nothingConnected) {
    return (
      <div className="mx-auto max-w-md rounded-2xl glass p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)" }}>
          <Plus className="text-brand-400" size={26} />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-ink">Welcome to rukMoney</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-dim">
          Connect your first account to see your net worth, investments, and spending in one place.
        </p>
        <button onClick={() => window.dispatchEvent(new Event("open-add"))} className="btn-gold mx-auto mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
          <Plus size={15} /> Connect an account
        </button>
        <p className="mt-3 text-[11px] text-ink-faint">Or <Link href="/holdings" className="underline">add a holding manually</Link>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Net worth — top anchor */}
      <CardShell title="Net worth" href="/networth" cta="Details" className="bg-gradient-to-br from-brand-500/[0.08] to-transparent">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-3xl font-bold text-ink md:text-4xl">{money(nw?.netWorth ?? 0)}</div>
          {nw?.changeAmount != null && (
            <span className={`inline-flex items-center gap-1 text-sm ${nw.changeAmount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {nw.changeAmount >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {money(Math.abs(nw.changeAmount))}{nw.changePct != null ? ` (${Math.abs(nw.changePct)}%)` : ""} this month
            </span>
          )}
        </div>
        <div className="mt-1 flex gap-4 text-xs text-ink-dim">
          <span>Assets <span className="text-emerald-400">{money(nw?.totalAssets ?? 0)}</span></span>
          <span>Liabilities <span className="text-rose-400">{money(nw?.totalLiabilities ?? 0)}</span></span>
        </div>
      </CardShell>

      {/* Investments — hero (most weight) */}
      <CardShell title="Investments" href="/holdings" cta="Open Invest">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-2xl font-bold text-ink">{money(inv.value)}</div>
          {inv.count > 0 && (
            <span className={`inline-flex items-center gap-1 text-sm ${inv.day >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {inv.day >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {money(Math.abs(inv.day))} today
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Link href="/research" className="rounded-lg border border-hairline bg-surface px-3 py-2 text-center text-xs text-ink-dim hover:text-ink"><TrendingUp size={14} className="mx-auto mb-1 text-brand-400" />Research</Link>
          <Link href="/predictions" className="rounded-lg border border-hairline bg-surface px-3 py-2 text-center text-xs text-ink-dim hover:text-ink"><Sparkles size={14} className="mx-auto mb-1 text-brand-400" />Predictions</Link>
          <Link href="/rankings" className="rounded-lg border border-hairline bg-surface px-3 py-2 text-center text-xs text-ink-dim hover:text-ink"><Scale size={14} className="mx-auto mb-1 text-brand-400" />Rankings</Link>
        </div>
      </CardShell>

      {/* Banking + Retirement row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CardShell title="Banking" href="/spending" cta="Spending" className="sm:col-span-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-ink-dim">Cash <span className="font-semibold text-ink">{money(bal?.totalCash ?? 0)}</span></span>
            <span className="text-ink-dim">Income <span className="text-emerald-400">{money(spend.income)}</span></span>
            <span className="text-ink-dim">Spent <span className="text-rose-400">{money(spend.expense)}</span></span>
            <span className="text-ink-dim">Net <span className={spend.net >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(spend.net)}</span></span>
          </div>
          {spend.top.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {spend.top.map(([c, v]) => (
                <span key={c} className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-dim">{c} {money(v)}</span>
              ))}
            </div>
          )}
        </CardShell>

        {/* Retirement — deliberately small */}
        <CardShell title="Retirement" href="/networth" cta="">
          <div className="flex items-center gap-2">
            <PiggyBank size={18} className="text-brand-400" />
            <div className="text-lg font-semibold text-ink">{money(retirement)}</div>
          </div>
        </CardShell>
      </div>

      {/* Insight card → Insights */}
      <CardShell title="Insights" href="/advisor" cta="Open">
        <p className="text-sm text-ink-dim">
          {nw?.changeAmount != null && nw.changeAmount !== 0
            ? `Your net worth is ${nw.changeAmount >= 0 ? "up" : "down"} ${money(Math.abs(nw.changeAmount))} this month.`
            : "Get a personalized review of your finances from Rukmani."}
        </p>
        <Link href="/advisor" className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-400 hover:underline">
          <Sparkles size={13} /> Ask Rukmani to review my finances
        </Link>
      </CardShell>

      {/* Connect prompt */}
      <button onClick={() => window.dispatchEvent(new Event("open-add"))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-strong py-3 text-sm text-ink-dim hover:bg-surface hover:text-ink">
        <Plus size={15} /> Connect another account or add a manual item
      </button>

      <p className="text-[11px] text-ink-faint">Summaries here — tap any card for detail. Research and education, not financial advice.</p>
    </div>
  );
}
