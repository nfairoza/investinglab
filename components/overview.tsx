"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUp, ArrowDown, Plus, TrendingUp, Sparkles, Scale, ChevronRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const COLORS = ["#16D27E", "#0EA6C9", "#11B4AE", "#34E0A1", "#60A5FA", "#F59E0B", "#FB7185", "#A78BFA", "#22D3EE"];
const TYPE_LABEL: Record<string, string> = {
  cash: "Cash", investment: "Investments", retirement: "Retirement", real_estate: "Real estate",
  vehicle: "Vehicles", other_asset: "Other assets",
};

interface Me { fullName?: string | null; email?: string | null }
interface TrendPt { month: string; netWorth: number; assets: number; liabilities: number }
interface NetWorth { netWorth: number; totalAssets: number; totalLiabilities: number; byType: Record<string, number>; changeAmount: number | null; changePct: number | null; trend?: TrendPt[] }
interface AdvisorStep { id: string; title: string; status: string; mathSummary: string; explanationInput: string }
interface AdvisorResp { result?: { steps: AdvisorStep[]; surplus: { available: boolean; surplus: number; destination: string }; avgMonthlyExpenses: number | null; liquidCash: number } }
interface Balances { totalCash: number; items: { accounts: { account_id: string; type: string; current: number | null }[] }[] }
interface Txn { date: string; amount: number; category: string; isTransfer: boolean; excluded: boolean; accountId?: string }
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

// Compact KPI tile for the Overview big-picture strip.
function Kpi({ label, value, delta, tone }: {
  label: string; value: string;
  delta?: { amount: number; pct: number | null; suffix?: string } | null;
  tone?: "up" | "down";
}) {
  const toneCls = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-ink";
  return (
    <div className="rounded-2xl glass p-4">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${toneCls} md:text-xl`}>{value}</div>
      {delta && (
        <div className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] ${delta.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {delta.amount >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {money(Math.abs(delta.amount))}{delta.pct != null ? ` (${Math.abs(delta.pct)}%)` : ""} {delta.suffix ?? "this month"}
        </div>
      )}
    </div>
  );
}

export function Overview() {
  const { data: nw, isLoading: nwLoading } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: bal } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: txnData } = useSWR<{ transactions: Txn[] }>("/api/plaid/transactions?sync=0", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: holdings, isLoading: holdingsLoading } = useSWR<Holding[]>("/api/holdings", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  // Computed advisor (GET = no AI tokens) — drives the compact insight card.
  const { data: advisor } = useSWR<AdvisorResp>("/api/advisor", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });

  // Local-time greeting (browser clock). First name only.
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();
  const firstName = (me?.fullName || me?.email?.split("@")[0] || "").trim().split(" ")[0];

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

  // Credit-card vs debit/checking spending this month. Joins each transaction
  // to its account type via the accounts list. Only meaningful when the user has
  // BOTH a credit card and a depository account linked.
  const payMix = useMemo(() => {
    const typeById = new Map<string, string>();
    for (const it of bal?.items ?? []) for (const a of it.accounts) typeById.set(a.account_id, a.type);
    const hasCredit = [...typeById.values()].includes("credit");
    const hasDebit = [...typeById.values()].includes("depository");
    const since = new Date(); since.setDate(1);
    const from = since.toISOString().slice(0, 10);
    let credit = 0, debit = 0;
    for (const t of txnData?.transactions ?? []) {
      if (t.date < from || t.excluded || t.isTransfer || t.amount <= 0) continue;
      const ty = t.accountId ? typeById.get(t.accountId) : undefined;
      if (ty === "credit") credit += t.amount;
      else if (ty === "depository") debit += t.amount;
    }
    return { credit, debit, show: hasCredit && hasDebit && credit + debit > 0 };
  }, [txnData, bal]);

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
  // Net-worth trend (last 12 months) + asset allocation by type, for charts.
  const trend = useMemo(() => (nw?.trend ?? []).slice(-12), [nw]);
  const allocation = useMemo(() => {
    const bt = nw?.byType ?? {};
    return Object.entries(bt)
      .filter(([, v]) => v > 0) // assets only (liabilities are negative)
      .map(([type, value]) => ({ name: TYPE_LABEL[type] ?? type, value }))
      .sort((a, b) => b.value - a.value);
  }, [nw]);

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
      {/* Greeting — local-time aware, lives on the home Overview */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink md:text-3xl">{greeting}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-0.5 text-sm text-ink-dim">Your whole financial life at a glance.</p>
      </div>

      {/* KPI strip — the big-picture numbers up top */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Net worth" value={money(nw?.netWorth ?? 0)}
          delta={nw?.changeAmount != null ? { amount: nw.changeAmount, pct: nw.changePct } : null} />
        <Kpi label="Investments" value={money(inv.value)}
          delta={inv.count > 0 ? { amount: inv.day, pct: null, suffix: "today" } : null} />
        <Kpi label="Cash" value={money(bal?.totalCash ?? 0)} />
        <Kpi label="Saved this month" value={money(spend.net)} tone={spend.net >= 0 ? "up" : "down"} />
      </div>

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
        {trend.length > 1 ? (
          <div className="mt-3 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ovNwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16D27E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#16D27E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip formatter={(v: number) => money(v)} labelFormatter={(l: string) => l}
                  contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                <Area type="monotone" dataKey="netWorth" stroke="#16D27E" strokeWidth={2} fill="url(#ovNwGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-ink-faint">Your net-worth trend builds month over month.</p>
        )}
      </Card>

      {/* Two-up grid on desktop so cards don't sprawl full-width. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Asset allocation — where your money sits (whole card → Net worth) */}
      {allocation.length > 0 && (
        <Card href="/networth" title="Asset allocation">
          <div className="flex items-center gap-4">
            <div className="h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                    {allocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg)" />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)}
                    contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {allocation.slice(0, 5).map((a, i) => (
                <li key={a.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-ink-dim">{a.name}</span>
                  <span className="shrink-0 font-medium text-ink">{money(a.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

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
      <Card href="/spending" title="Banking — this month">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-dim">Cash <span className="font-semibold text-ink">{money(bal?.totalCash ?? 0)}</span></span>
          <span className="text-ink-dim">Income <span className="text-emerald-400">{money(spend.income)}</span></span>
          <span className="text-ink-dim">Spent <span className="text-rose-400">{money(spend.expense)}</span></span>
          <span className="text-ink-dim">Net <span className={spend.net >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(spend.net)}</span></span>
        </div>
        {/* Income vs spending proportion bar */}
        {(spend.income > 0 || spend.expense > 0) && (
          <div className="mt-2.5">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-raised">
              {(() => {
                const tot = Math.max(spend.income, spend.expense, 1);
                return (
                  <>
                    <div className="bg-emerald-500/70" style={{ width: `${(spend.income / tot) * 100}%` }} />
                  </>
                );
              })()}
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-raised">
              <div className="bg-rose-500/70" style={{ width: `${(spend.expense / Math.max(spend.income, spend.expense, 1)) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
              <span>Income</span><span>Spending</span>
            </div>
          </div>
        )}
        {spend.top.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {spend.top.map(([c, v]) => (
              <span key={c} className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-dim">{c} {money(v)}</span>
            ))}
          </div>
        )}
      </Card>

      {/* Credit vs debit spending — only when both account types are linked */}
      {payMix.show && (
        <Card href="/spending" title="Credit vs debit — this month">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] text-ink-faint">On credit cards</div>
              <div className="text-lg font-bold text-rose-400">{money(payMix.credit)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-ink-faint">On debit / checking</div>
              <div className="text-lg font-bold text-sky-400">{money(payMix.debit)}</div>
            </div>
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-raised">
            <div className="bg-rose-500/70" style={{ width: `${(payMix.credit / (payMix.credit + payMix.debit)) * 100}%` }} />
            <div className="bg-sky-500/70" style={{ width: `${(payMix.debit / (payMix.credit + payMix.debit)) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/70" /> Credit {Math.round((payMix.credit / (payMix.credit + payMix.debit)) * 100)}%</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500/70" /> Debit {Math.round((payMix.debit / (payMix.credit + payMix.debit)) * 100)}%</span>
          </div>
        </Card>
      )}

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
      </div>

      <p className="text-[11px] text-ink-faint">Tap any card for the full view. Research and education, not financial advice.</p>
    </div>
  );
}
