"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { Search, SlidersHorizontal, X, Repeat, Sparkles, AlertTriangle } from "lucide-react";

interface Txn {
  id: string; date: string; name: string; merchant: string | null;
  amount: number; currency: string; category: string; institution: string | null;
  pending: boolean; isTransfer: boolean; excluded: boolean;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number, c = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

const CATEGORIES = [
  "Income", "Groceries", "Restaurants", "Coffee", "Shopping", "Transportation",
  "Travel", "Bills & Utilities", "Rent & Mortgage", "Health", "Entertainment",
  "Subscriptions", "Transfer", "Fees", "Other", "Uncategorized",
];

type FlagFilter = "all" | "recurring" | "new" | "unusual" | "flagged";
type AmountSign = "all" | "expense" | "income";

interface Insight { recurring: boolean; isNew: boolean; unusual: boolean; typical?: number }

// Derive per-transaction insight flags from the whole transaction set:
//  • recurring — same merchant seen in ≥2 distinct months
//  • new       — merchant's first-ever appearance is within the last 21 days
//  • unusual   — an expense ≥2.5× that merchant's median (and ≥ $40 over it)
function buildInsights(txns: Txn[]): Map<string, Insight> {
  const byMerchant = new Map<string, { dates: string[]; amounts: number[]; months: Set<string> }>();
  for (const t of txns) {
    if (t.amount <= 0) continue; // expenses only for recurring/unusual
    const key = (t.merchant ?? t.name ?? "").toLowerCase().trim();
    if (!key) continue;
    const rec = byMerchant.get(key) ?? { dates: [], amounts: [], months: new Set<string>() };
    rec.dates.push(t.date); rec.amounts.push(t.amount); rec.months.add(t.date.slice(0, 7));
    byMerchant.set(key, rec);
  }
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 21);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const out = new Map<string, Insight>();
  for (const t of txns) {
    const key = (t.merchant ?? t.name ?? "").toLowerCase().trim();
    const m = byMerchant.get(key);
    let recurring = false, isNew = false, unusual = false, typical: number | undefined;
    if (m && t.amount > 0) {
      recurring = m.months.size >= 2;
      const firstSeen = m.dates.reduce((a, b) => (a < b ? a : b));
      isNew = firstSeen >= cutoffStr && m.dates.length <= 2;
      typical = median(m.amounts);
      unusual = m.amounts.length >= 3 && typical > 0 && t.amount >= typical * 2.5 && t.amount - typical >= 40;
    }
    out.set(t.id, { recurring, isNew, unusual, typical });
  }
  return out;
}

export function TransactionsView() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  // Deep-link: /transactions?category=LOAN_PAYMENTS&q=… pre-filters the list
  // (e.g. from the "Unusual this month" insight). Opens the filter panel so the
  // active filter is visible.
  useEffect(() => {
    const c = params.get("category");
    const query = params.get("q");
    if (c) { setCategory(c); setShowFilters(true); }
    if (query) setQ(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [account, setAccount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sign, setSign] = useState<AmountSign>("all");
  const [flag, setFlag] = useState<FlagFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ transactions: Txn[]; configured?: boolean }>(
    "/api/plaid/transactions", fetchJson, { revalidateOnFocus: false },
  );

  const txns = data?.transactions ?? [];
  const categories = useMemo(() => Array.from(new Set(txns.map((t) => t.category))).sort(), [txns]);
  const accounts = useMemo(() => Array.from(new Set(txns.map((t) => t.institution).filter(Boolean) as string[])).sort(), [txns]);
  const insights = useMemo(() => buildInsights(txns), [txns]);

  const filtered = txns.filter((t) => {
    if (category && t.category !== category) return false;
    if (account && t.institution !== account) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (sign === "expense" && t.amount <= 0) return false;
    if (sign === "income" && t.amount >= 0) return false;
    if (q && !`${t.name} ${t.merchant ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (flag !== "all") {
      const ins = insights.get(t.id);
      if (flag === "recurring" && !ins?.recurring) return false;
      if (flag === "new" && !ins?.isNew) return false;
      if (flag === "unusual" && !ins?.unusual) return false;
      if (flag === "flagged" && !t.isTransfer && !t.excluded) return false;
    }
    return true;
  });

  const activeFilters = [category, account, from, to, sign !== "all" ? sign : "", flag !== "all" ? flag : ""].filter(Boolean).length;

  function clearFilters() {
    setCategory(""); setAccount(""); setFrom(""); setTo(""); setSign("all"); setFlag("all");
  }

  async function recategorize(t: Txn, newCat: string, applyToMerchant: boolean) {
    await fetch("/api/plaid/transactions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: t.id, category: newCat, merchant: t.merchant ?? t.name, applyToMerchant }),
    });
    mutate();
  }
  async function toggleFlag(t: Txn, field: "isTransfer" | "excluded") {
    await fetch("/api/plaid/transactions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: t.id, [field]: !t[field] }),
    });
    mutate();
  }

  if (data?.configured === false) return <Empty>Bank connections aren&apos;t available yet.</Empty>;
  if (!isLoading && txns.length === 0) {
    return <Empty>No transactions yet. <Link href="/settings" className="text-brand-400 underline">Connect a bank</Link> to see your spending here.</Empty>;
  }

  const selectCls = "rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus:outline-none";
  const selectStyle = { background: "var(--surface-solid)", color: "var(--text)" } as const;
  const totalExpense = filtered.filter((t) => t.amount > 0 && !t.excluded && !t.isTransfer).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      {/* Search + filter toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
          <Search size={15} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or description…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
        <button onClick={() => setShowFilters((s) => !s)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${activeFilters || showFilters ? "border-brand-500/40 bg-brand-500/10 text-brand-200" : "border-hairline text-ink-dim hover:text-ink"}`}>
          <SlidersHorizontal size={15} /> Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {/* Advanced filters — collapsible */}
      {showFilters && (
        <div className="rounded-xl border border-hairline bg-surface p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${selectCls} w-full`} style={selectStyle}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Account">
              <select value={account} onChange={(e) => setAccount(e.target.value)} className={`${selectCls} w-full`} style={selectStyle}>
                <option value="">All accounts</option>
                {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select value={sign} onChange={(e) => setSign(e.target.value as AmountSign)} className={`${selectCls} w-full`} style={selectStyle}>
                <option value="all">Income & expenses</option>
                <option value="expense">Expenses only</option>
                <option value="income">Income only</option>
              </select>
            </Field>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${selectCls} w-full`} style={selectStyle} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${selectCls} w-full`} style={selectStyle} /></Field>
            <Field label="Flag / insight">
              <select value={flag} onChange={(e) => setFlag(e.target.value as FlagFilter)} className={`${selectCls} w-full`} style={selectStyle}>
                <option value="all">Any</option>
                <option value="recurring">Recurring</option>
                <option value="new">New merchant</option>
                <option value="unusual">Unusual amount</option>
                <option value="flagged">Flagged (transfer/excluded)</option>
              </select>
            </Field>
          </div>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Result summary */}
      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</span>
        <span>Expenses shown: <span className="font-medium text-ink-dim">{money(totalExpense)}</span></span>
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {filtered.map((t) => {
          const ins = insights.get(t.id);
          return (
            <div key={t.id} className={`rounded-xl border border-hairline bg-surface p-3 ${t.excluded ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">{t.merchant ?? t.name}</span>
                    {ins?.recurring && <Badge cls="border-sky-500/40 bg-sky-500/10 text-sky-300" icon={Repeat}>Recurring</Badge>}
                    {ins?.isNew && <Badge cls="border-violet-500/40 bg-violet-500/10 text-violet-300" icon={Sparkles}>New</Badge>}
                    {ins?.unusual && <Badge cls="border-amber-500/40 bg-amber-500/10 text-amber-300" icon={AlertTriangle}>Unusual</Badge>}
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    {t.date}{t.institution ? ` · ${t.institution}` : ""}{t.pending ? " · pending" : ""}
                    {ins?.unusual && ins.typical ? ` · usually ~${money(ins.typical, t.currency)}` : ""}
                  </div>
                </div>
                <div className={`shrink-0 text-sm font-semibold ${t.amount < 0 ? "text-emerald-400" : "text-ink"}`}>
                  {t.amount < 0 ? "+" : "-"}{money(Math.abs(t.amount), t.currency)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={t.category} onChange={(e) => recategorize(t, e.target.value, false)}
                  className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim focus:outline-none" style={selectStyle}>
                  {[...new Set([t.category, ...CATEGORIES])].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => recategorize(t, t.category, true)} title="Always categorize this merchant this way"
                  className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-faint hover:bg-surface-raised hover:text-ink">
                  Apply to merchant
                </button>
                <button onClick={() => toggleFlag(t, "isTransfer")}
                  className={`rounded-md border px-2 py-1 text-[11px] ${t.isTransfer ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-hairline text-ink-faint hover:text-ink"}`}>
                  Transfer
                </button>
                <button onClick={() => toggleFlag(t, "excluded")}
                  className={`rounded-md border px-2 py-1 text-[11px] ${t.excluded ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-hairline text-ink-faint hover:text-ink"}`}>
                  {t.excluded ? "Excluded" : "Exclude"}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <Empty>No transactions match these filters.</Empty>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, cls, icon: Icon }: { children: React.ReactNode; cls: string; icon: typeof Repeat }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${cls}`}>
      <Icon size={9} /> {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">{children}</div>;
}
