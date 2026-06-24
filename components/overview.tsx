"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUp, ArrowDown, Plus, TrendingUp, Sparkles, Scale, ChevronRight } from "lucide-react";

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface NetWorth { netWorth: number; totalAssets: number; totalLiabilities: number; byType: Record<string, number>; changeAmount: number | null; changePct: number | null }
interface AdvisorStep { id: string; title: string; status: string; mathSummary: string; explanationInput: string }
interface AdvisorResp { result?: { steps: AdvisorStep[]; surplus: { available: boolean; surplus: number; destination: string }; avgMonthlyExpenses: number | null; liquidCash: number } }
interface Balances { totalCash: number; items: { accounts: { type: string; current: number | null }[] }[] }
interface Txn { date: string; amount: number; category: string; isTransfer: boolean; excluded: boolean }
interface Holding { symbol: string; shares: number; marketValue?: number; daysGain?: number }

// Whole-card link: the entire card is clickable (no separate "→" button).
function Card({ href, title, children, className = "" }: { href: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href}
      className={`card-hover group block rounded-2xl glass p-5 transition-transform active:scale-[0.99] ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <ChevronRight size={16} className="text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3">{children}</div>
    </Link>
  );
}

export function Overview() {
  const { data: nw, isLoading: nwLoading } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: bal } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: txnData } = useSWR<{ transactions: Txn[] }>("/api/plaid/transactions?sync=0", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: holdings, isLoading: holdingsLoading } = useSWR<Holding[]>("/api/holdings", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  // Computed advisor (GET = no AI tokens) — drives the compact insight card.
  const { data: advisor } = useSWR<AdvisorResp>("/api/advisor", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });

  const inv = useMemo(() => {
    const list = holdings ?? [];
    let value = 0, day = 0;
    for (const h of list) { value += h.marketValue ?? 0; day += h.daysGain ?? 0; }
    return { value, day, count: list.length };
  }, [holdings]);

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

  // Top advisor insight: the highest-priority step needing attention, plus the
  // surplus destination. Computed server-side — we only pick what to surface.
  const insight = useMemo(() => {
    const r = advisor?.result;
    if (!r) return null;
    const step = r.steps.find((s) => s.status === "attention") ?? r.steps.find((s) => s.status === "in_progress");
    const line = step ? step.mathSummary || step.title : null;
    const surplusLine = r.surplus.available && r.surplus.surplus > 0
      ? `${money(r.surplus.surplus)} surplus → ${r.surplus.destination}`
      : null;
    return { title: step?.title ?? null, line, surplusLine };
  }, [advisor]);

  // Only treat the account as empty once data has actually loaded at least once.
  // Otherwise the welcome screen flashes on every refresh for connected users.
  const loaded = nw !== undefined && holdings !== undefined;
  const firstLoad = (nwLoading || holdingsLoading) && !loaded;
  const nothingConnected = loaded && (nw?.totalAssets ?? 0) === 0 && (nw?.totalLiabilities ?? 0) === 0 && inv.count === 0;

  if (firstLoad) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl glass" />
        <div className="h-28 animate-pulse rounded-2xl glass" />
        <div className="h-24 animate-pulse rounded-2xl glass" />
      </div>
    );
  }

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
      {/* Net worth — top anchor (whole card → Net worth) */}
      <Card href="/networth" title="Net worth" className="bg-gradient-to-br from-brand-500/[0.08] to-transparent">
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
      </Card>

      {/* Investments — hero (whole card → Invest dashboard) */}
      <Card href="/dashboard" title="Investments">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-2xl font-bold text-ink">{money(inv.value)}</div>
          {inv.count > 0 && (
            <span className={`inline-flex items-center gap-1 text-sm ${inv.day >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {inv.day >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {money(Math.abs(inv.day))} today
            </span>
          )}
        </div>
        {/* These chips deep-link past the dashboard — stopPropagation so they don't double-fire the card link. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { href: "/research", label: "Research", icon: TrendingUp },
            { href: "/predictions", label: "Predictions", icon: Sparkles },
            { href: "/rankings", label: "Rankings", icon: Scale },
          ].map((c) => (
            <Link key={c.href} href={c.href} onClick={(e) => e.stopPropagation()}
              className="rounded-lg border border-hairline bg-surface px-3 py-2 text-center text-xs text-ink-dim hover:text-ink">
              <c.icon size={14} className="mx-auto mb-1 text-brand-400" />{c.label}
            </Link>
          ))}
        </div>
      </Card>

      {/* Banking (whole card → Spending) */}
      <Card href="/spending" title="Banking">
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
      </Card>

      {/* AI insight (whole card → Advisor) — driven by the computed advisor */}
      <Card href="/advisor" title="Rukmani — your next money move">
        {insight?.line ? (
          <div className="space-y-1.5">
            {insight.title && <div className="text-sm font-medium text-ink">Focus: {insight.title}</div>}
            <p className="text-sm text-ink-dim">{insight.line}</p>
            {insight.surplusLine && (
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-[11px] text-brand-200">{insight.surplusLine}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-dim">
            {nw?.changeAmount != null && nw.changeAmount !== 0
              ? `Your net worth is ${nw.changeAmount >= 0 ? "up" : "down"} ${money(Math.abs(nw.changeAmount))} this month. Tap for your order-of-operations plan.`
              : "Get your personalized financial order of operations from Rukmani."}
          </p>
        )}
      </Card>

      {/* Connect prompt */}
      <button onClick={() => window.dispatchEvent(new Event("open-add"))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-strong py-3 text-sm text-ink-dim hover:bg-surface hover:text-ink">
        <Plus size={15} /> Connect another account or add a manual item
      </button>

      <p className="text-[11px] text-ink-faint">Tap any card for the full view. Research and education, not financial advice.</p>
    </div>
  );
}
