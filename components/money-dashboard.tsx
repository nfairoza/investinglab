"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Landmark, ChevronDown, Receipt, PieChart as PieIcon, Scale, Sparkles, Scissors, ArrowRight, Eye, RefreshCw, Repeat, PiggyBank, Stethoscope, AlertTriangle, Lightbulb } from "lucide-react";
import { GradientStat } from "./dashboard-extras";

interface Account { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface Item { itemId: string; institution: string; accounts: Account[]; error?: string }
interface Balances { items: Item[]; totalCash: number; configured?: boolean }
interface Txn { id: string; date: string; amount: number; category: string; isTransfer: boolean; excluded: boolean }
interface NetWorth { netWorth: number; totalAssets: number; totalLiabilities: number }
interface Analysis { summary: string; cut: string[]; redirect: string[]; watch: string[]; alarming?: string[]; ideas?: string[] }
interface DoctorResp { analysis: Analysis | null; model: string | null; generatedAt: string | null; cached?: boolean }
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

  const items = bal?.items ?? [];
  const hasAccounts = items.some((i) => i.accounts.length > 0);

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

      {/* AI spending analysis */}
      <MoneyAnalysis />

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

// AI analysis: what to cut, where money can go, what to watch.
// Money Doctor — the money-side counterpart to Portfolio Doctor. Auto-loads the
// cached checkup on mount (cached 24h server-side to save tokens); a small
// "Re-analyze" link forces a fresh run.
function MoneyAnalysis() {
  const [data, setData] = useState<DoctorResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ranAuto = useRef(false);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/money/analysis", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.message ?? "Couldn't run the checkup."); return; }
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  // On mount: load the cached checkup; if there's none, leave the CTA showing
  // (don't auto-spend tokens — the user taps to run the first one).
  useEffect(() => {
    if (ranAuto.current) return;
    ranAuto.current = true;
    (async () => {
      try {
        const j: DoctorResp = await fetch("/api/money/analysis").then((r) => r.json());
        if (j.analysis) setData(j);
      } catch { /* ignore — CTA stays */ }
    })();
  }, []);

  const title = (
    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Stethoscope size={16} className="text-brand-400" /> Money Doctor</div>
  );

  if (!data && !busy) {
    return (
      <div className="rounded-2xl glass p-5">
        {title}
        <p className="mt-1 text-sm text-ink-dim">A full checkup of your money — spending, recurring bills, cash runway, and debt — with what to cut, where money should go, anything alarming, and ideas. Computed from your real data.</p>
        <button onClick={run} className="btn-gold mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"><Stethoscope size={15} /> Run my checkup</button>
        {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}
      </div>
    );
  }
  if (busy && !data) {
    return <div className="rounded-2xl glass p-5"><div className="flex items-center gap-2 text-sm text-ink-dim"><RefreshCw size={14} className="animate-spin" /> Running your checkup…</div></div>;
  }
  const a = data!.analysis;
  if (!a) {
    return <div className="rounded-2xl glass p-5 text-sm text-ink-dim">Checkup unavailable right now. The charts above are computed from your real data.</div>;
  }
  const when = data!.generatedAt ? new Date(data!.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="rounded-2xl glass p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        {title}
        <div className="flex items-center gap-2">
          {when && <span className="text-[10px] text-ink-faint">as of {when}</span>}
          <button onClick={run} disabled={busy} className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink disabled:opacity-50"><RefreshCw size={11} className={busy ? "animate-spin" : ""} /> Re-analyze</button>
        </div>
      </div>
      {a.summary && <p className="text-sm text-ink-dim">{a.summary}</p>}
      {a.alarming && a.alarming.length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
          <AnalysisBlock icon={AlertTriangle} title="Worth attention now" items={a.alarming} cls="text-rose-300" />
        </div>
      )}
      <AnalysisBlock icon={Scissors} title="Where to consider cutting" items={a.cut} cls="text-amber-300" />
      <AnalysisBlock icon={ArrowRight} title="Where the money could go" items={a.redirect} cls="text-emerald-300" />
      <AnalysisBlock icon={Eye} title="Keep an eye on" items={a.watch} cls="text-sky-300" />
      {a.ideas && a.ideas.length > 0 && <AnalysisBlock icon={Lightbulb} title="Ideas" items={a.ideas} cls="text-violet-300" />}
      <p className="text-[11px] text-ink-faint">Numbers computed by rukMoney before narration{data!.model ? ` · narrated by ${data!.model}` : ""}. Cached for a day to save tokens. Educational only — not financial advice.</p>
    </div>
  );
}

function AnalysisBlock({ icon: Icon, title, items, cls }: { icon: typeof Scissors; title: string; items: string[]; cls: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${cls}`}><Icon size={13} /> {title}</div>
      <ul className="mt-1.5 space-y-1">
        {items.map((it, i) => <li key={i} className="text-sm text-ink-dim">• {it}</li>)}
      </ul>
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
