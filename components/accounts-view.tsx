"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Landmark, RefreshCw, ChevronDown } from "lucide-react";

interface Account { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface Item { itemId: string; institution: string; accounts: Account[]; error?: string }
interface Balances { items: Item[]; totalCash: number; configured?: boolean }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

const TYPE_LABEL: Record<string, string> = {
  depository: "Cash", credit: "Credit", loan: "Loan", investment: "Investment", brokerage: "Brokerage", other: "Other",
};

export function AccountsView() {
  const { data, isLoading, mutate } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false });

  // Money → banking accounts only (cash, credit, loans). Brokerage/investment
  // accounts are shown in the Invest section, not here.
  const items = (data?.items ?? [])
    .map((it) => ({ ...it, accounts: it.accounts.filter((a) => a.type === "depository" || a.type === "credit" || a.type === "loan") }))
    .filter((it) => it.accounts.length > 0);
  const hasAny = items.length > 0;

  // Net assets vs debts.
  let assets = 0, debts = 0;
  for (const it of items) for (const a of it.accounts) {
    const v = a.current ?? 0;
    if (a.type === "credit" || a.type === "loan") debts += v; else assets += v;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total cash" value={money(data?.totalCash ?? 0)} />
          <Stat label="Assets" value={money(assets)} />
          <Stat label="Debts" value={money(debts)} />
        </div>
        <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {data && data.configured === false && (
        <Empty>Bank connections aren&apos;t available yet.</Empty>
      )}
      {!isLoading && !hasAny && data?.configured !== false && (
        <Empty>
          No accounts connected yet. <Link href="/settings" className="text-brand-400 underline">Connect a bank</Link> to see balances here.
        </Empty>
      )}

      {items.map((it) => (
        it.accounts.length > 0 && <InstitutionCard key={it.itemId} item={it} />
      ))}
    </div>
  );
}

// One institution: collapsible. Header shows name, account count, and the
// institution's net balance; click to expand the per-account list.
function InstitutionCard({ item }: { item: Item }) {
  const [open, setOpen] = useState(true);
  const net = item.accounts.reduce((s, a) => {
    const v = a.current ?? 0;
    return s + ((a.type === "credit" || a.type === "loan") ? -v : v);
  }, 0);
  const currency = item.accounts[0]?.currency ?? "USD";

  return (
    <div className="rounded-2xl glass">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={open}>
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
                <div className="text-[11px] text-ink-faint">{TYPE_LABEL[a.type] ?? a.type}{a.subtype ? ` · ${a.subtype}` : ""}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-ink">{money(a.current, a.currency)}</div>
                {a.available != null && a.available !== a.current && (
                  <div className="text-[11px] text-ink-faint">{money(a.available, a.currency)} avail</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl glass px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">{children}</div>;
}
