"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Landmark, ChevronDown, Receipt, PieChart as PieIcon, Scale, ArrowRight, RefreshCw, Repeat, PiggyBank, Stethoscope } from "lucide-react";
import { GradientStat } from "./dashboard-extras";

interface Account { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface Item { itemId: string; institution: string; accounts: Account[]; error?: string }
interface Balances { items: Item[]; totalCash: number; configured?: boolean }
interface Txn { id: string; date: string; amount: number; category: string; isTransfer: boolean; excluded: boolean }
interface NetWorth { netWorth: number; totalAssets: number; totalLiabilities: number }
interface AdvisorResp { result?: {
  liquidCash: number; avgMonthlyExpenses: number | null;
  surplus: { available: boolean; surplus: number; destination: string };
  spending: { available: boolean; recurring: { merchant: string; amount: number; months: number }[] };
} }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);
const COLORS = ["#16D27E", "#0EA6C9", "#11B4AE", "#34E0A1", "#60A5FA", "#F59E0B", "#FB7185", "#FBBF24", "#A78BFA", "#22D3EE"];

export function MoneyDashboard() {
  const { data: bal, isLoading: balLoading, mutate: mutateBal } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: txnData } = useSWR<{ transactions: Txn[]; configured?: boolean }>("/api/plaid/transactions?sync=0", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: nw } = useSWR<NetWorth>("/api/networth", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  // Computed advisor (GET = no AI tokens): runway, surplus routing, recurring bills.
  const { data: advisor } = useSWR<AdvisorResp>("/api/advisor", fetchJson, { revalidateOnFocus: false, keepPreviousData: true });

  // Money shows BANKING accounts only (cash, credit, loans). Brokerage /
  // investment accounts live in the Invest section. Filter each institution to
  // its banking accounts and drop institutions left with none.
  const items = (bal?.items ?? [])
    .map((it) => ({ ...it, accounts: it.accounts.filter((a) => a.type === "depository" || a.type === "credit" || a.type === "loan") }))
    .filter((it) => it.accounts.length > 0);
  const hasAccounts = items.length > 0;

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
    const catList = [...cats.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { income, expense, net: income - expense, cats: catList };
  }, [txnData]);

  // Savings rate this month + cash runway (months of expenses covered by cash).
  const savingsRate = spend.income > 0 ? Math.round((spend.net / spend.income) * 100) : null;
  const adv = advisor?.result;
  const runway = adv?.avgMonthlyExpenses && adv.avgMonthlyExpenses > 0
    ? adv.liquidCash / adv.avgMonthlyExpenses : null;
  const recurring = adv?.spending?.recurring ?? [];
  const recurringTotal = recurring.reduce((s, r) => s + r.amount, 0);

  if (bal?.configured === false) {
    return <Empty>Bank connections aren&apos;t available yet.</Empty>;
  }
  if (!balLoading && !hasAccounts) {
    return (
      <Empty>
        No accounts connected yet.{" "}
        <button onClick={() => window.dispatchEvent(new Event("open-add"))} className="text-brand-400 underline">Connect a bank</button>{" "}
        to see balances, spending, and analysis here.
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top: connected accounts + balances */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Your accounts</h2>
          <button onClick={() => mutateBal()} className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cash" value={money(bal?.totalCash ?? 0)} />
          <Stat label="Net worth" value={money(nw?.netWorth ?? 0)} />
          <Stat label="Assets" value={money(nw?.totalAssets ?? 0)} />
          <Stat label="Liabilities" value={money(nw?.totalLiabilities ?? 0)} />
        </div>
        {items.map((it) => it.accounts.length > 0 && <InstitutionCard key={it.itemId} item={it} />)}
      </div>

      {/* This month at a glance — same gradient-stat language as the Invest dashboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GradientStat label="Income" tone="emerald" value={money(spend.income)} sub="this month" />
        <GradientStat label="Spent" tone="rose" value={money(spend.expense)} sub="this month" />
        <GradientStat label="Saved" tone={spend.net >= 0 ? "emerald" : "rose"}
          value={money(spend.net)} sub={savingsRate != null ? `${savingsRate}% savings rate` : "this month"} />
        <GradientStat label="Cash runway" tone="violet"
          value={runway != null ? `${runway.toFixed(1)} mo` : "—"}
          sub={runway != null ? "of expenses in cash" : "link a bank"} />
      </div>

      {/* Spending by category */}
      {spend.cats.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-ink">Spending by category</div>
            <div className="mt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={spend.cats} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {spend.cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg)" />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl glass p-5">
            <div className="text-sm font-semibold text-ink">Top categories</div>
            <ul className="mt-3 space-y-2">
              {spend.cats.slice(0, 6).map((c, i) => (
                <li key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-ink-dim">{c.name}</span>
                  <span className="shrink-0 font-medium text-ink">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Surplus routing hint + recurring bills — what a person actually wants to know */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {adv?.surplus?.available && adv.surplus.surplus > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><PiggyBank size={16} className="text-brand-400" /> Spare cash this month</div>
            <div className="mt-2 text-2xl font-bold text-ink">{money(adv.surplus.surplus)}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-sm text-brand-200">
              <ArrowRight size={14} /> Best next move: {adv.surplus.destination}
            </div>
            <Link href="/advisor" className="mt-3 block text-xs text-brand-300 hover:underline">See your full plan →</Link>
          </div>
        )}
        {recurring.length > 0 && (
          <div className="rounded-2xl glass p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Repeat size={16} className="text-brand-400" /> Recurring bills</div>
              <span className="text-xs text-ink-faint">~{money(recurringTotal)}/mo</span>
            </div>
            <ul className="mt-3 divide-y divide-hairline">
              {recurring.slice(0, 5).map((r) => (
                <li key={r.merchant} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="truncate text-ink-dim">{r.merchant}<span className="text-ink-faint"> · {r.months} mo</span></span>
                  <span className="shrink-0 font-medium text-ink">{money(r.amount)}/mo</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Accounts Doctor entry — full checkup lives on its own page */}
      <Link href="/accounts-doctor" className="card-hover flex items-center gap-3 rounded-2xl glass p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)" }}>
          <Stethoscope size={20} className="text-brand-400" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Accounts Doctor</span>
          <span className="block text-xs text-ink-dim">A full checkup — cash runway, savings rate, debt, recurring bills, and what to cut/where money should go.</span>
        </span>
        <ArrowRight size={16} className="shrink-0 text-ink-faint" />
      </Link>

      {/* Sub-page links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard href="/networth" icon={Scale} label="Net worth" />
        <NavCard href="/accounts" icon={Landmark} label="Accounts" />
        <NavCard href="/transactions" icon={Receipt} label="Transactions" />
        <NavCard href="/spending" icon={PieIcon} label="Spending" />
      </div>

      <p className="text-[11px] text-ink-faint">Based on your linked accounts. Educational insights only — not financial advice.</p>
    </div>
  );
}

function InstitutionCard({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const net = item.accounts.reduce((s, a) => {
    const v = a.current ?? 0;
    return s + ((a.type === "credit" || a.type === "loan") ? -v : v);
  }, 0);
  const currency = item.accounts[0]?.currency ?? "USD";
  return (
    <div className="rounded-2xl glass">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left" aria-expanded={open}>
        <ChevronDown size={16} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
        <Landmark size={16} className="shrink-0 text-brand-400" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{item.institution ?? "Bank"}</span>
          <span className="block text-[11px] text-ink-faint">{item.accounts.length} account{item.accounts.length !== 1 ? "s" : ""}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-ink">{money(net, currency)}</span>
          <span className="block text-[10px] uppercase tracking-wide text-ink-faint">net</span>
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-hairline border-t border-hairline px-5 pb-1">
          {item.accounts.map((a) => (
            <li key={a.account_id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{a.name}{a.mask ? <span className="text-ink-faint"> ••{a.mask}</span> : null}</div>
                <div className="text-[11px] text-ink-faint">{a.type}{a.subtype ? ` · ${a.subtype}` : ""}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-ink">{money(a.current, a.currency)}</div>
                {a.available != null && a.available !== a.current && <div className="text-[11px] text-ink-faint">{money(a.available, a.currency)} avail</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NavCard({ href, icon: Icon, label }: { href: string; icon: typeof Scale; label: string }) {
  return (
    <Link href={href} className="card-hover flex flex-col items-center gap-1.5 rounded-xl glass p-4 text-center">
      <Icon size={18} className="text-brand-400" />
      <span className="text-xs font-medium text-ink">{label}</span>
    </Link>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: "emerald" | "rose"; big?: boolean }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "rose" ? "text-rose-400" : "text-ink";
  return (
    <div className="rounded-xl glass px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 font-semibold ${big ? "text-xl" : "text-lg"} ${color}`}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">{children}</div>;
}
