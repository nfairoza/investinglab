"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import Link from "next/link";
import { Landmark, RefreshCw, ChevronDown, AlertTriangle, Clock } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ErrorState } from "./data-state";
import { ReconnectButton } from "./money/reconnect-button";

interface Account { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface Item {
  itemId: string; institution: string; accounts: Account[]; error?: string;
  // Plaid item-health (0046): reauth flags a de-authed bank; itemStale = >48h silent.
  status?: string; lastSyncedAt?: string | null; errorCode?: string | null;
  statusChangedAt?: string | null; itemStale?: boolean;
}
interface Freshness { newestTxnDate: string | null; lastSyncedAt: string | null }
interface Balances { items: Item[]; totalCash: number; configured?: boolean; freshness?: Freshness }

// "Jun 23" from a YYYY-MM-DD date.
function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
// "3h ago" from an ISO timestamp.
function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "not yet";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Friendly "since Jul 9" for the reauth banner.
function sinceLabel(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "recently" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

const TYPE_LABEL: Record<string, string> = {
  depository: "Cash", credit: "Credit", loan: "Loan", investment: "Investment", brokerage: "Brokerage", other: "Other",
};

export function AccountsView() {
  const { data, error, isLoading, mutate } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  // Refresh = force a LIVE Plaid pull (on-demand transactions/refresh + balances),
  // then re-read. Gives the button real feedback and, if Plaid rejects the
  // on-demand refresh (plan without it), the reason.
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    try {
      // /api/plaid/refresh now syncs TRANSACTIONS + balances, so revalidate both
      // the accounts view and every transactions/spending SWR key so new spending
      // shows up without a page reload.
      const r = await fetch("/api/plaid/refresh", { method: "POST" }).then((x) => x.json()).catch(() => null);
      await Promise.all([
        mutate(),
        globalMutate((key) => typeof key === "string" && key.startsWith("/api/plaid/transactions")),
        globalMutate((key) => typeof key === "string" && key.startsWith("/api/money/")),
      ]);
      setRefreshedAt(new Date());
      // Honest outcome: Plaid accepted the pull (added N), or it rejected it
      // (on-demand refresh not on the plan) — show the code so it's diagnosable.
      if (r?.refreshError) setRefreshNote(`Plaid didn't allow an on-demand refresh (${r.refreshError}). Your bank's data updates on Plaid's daily schedule.`);
      else if (r?.forcedRefresh && (r?.added ?? 0) === 0) setRefreshNote("Asked your bank for new activity — nothing new has posted since the last sync.");
      else setRefreshNote(null);
    } finally { setRefreshing(false); }
  }

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

  // Item-health surfaces from the RAW item list (a reauth item may have no
  // accounts to show, so we don't read the filtered `items` here).
  const reauth = (data?.items ?? []).filter((it) => it.status === "reauth_required");
  const staleItems = (data?.items ?? []).filter((it) => it.status !== "reauth_required" && it.itemStale);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total cash" value={money(data?.totalCash ?? 0)} />
          <Stat label="Assets" value={money(assets)} />
          <Stat label="Debts" value={money(debts)} />
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && !refreshing && <span className="text-[11px] text-ink-faint">Updated {refreshedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          <button onClick={refresh} disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink disabled:opacity-60">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Data-recency readout: newest transaction on file + last sync. Makes the
          freshness gap legible ("bank hasn't posted recent activity" vs "stuck"). */}
      {hasAny && data?.freshness && (
        <p className="text-[11px] text-ink-faint">
          Latest transaction: <span className="text-ink-dim">{fmtDay(data.freshness.newestTxnDate)}</span>
          <span className="mx-1.5">·</span>
          Last synced <span className="text-ink-dim">{fmtAgo(data.freshness.lastSyncedAt)}</span>
        </p>
      )}
      {refreshNote && <p className="text-[11px] text-amber-200/80">{refreshNote}</p>}

      {/* Item-health: a de-authed bank paused data — clear banner + Reconnect. */}
      {reauth.map((it) => (
        <div key={it.itemId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <div className="text-sm font-medium text-ink">{it.institution ?? "A bank"} needs to be reconnected</div>
              <div className="text-xs text-ink-dim">Data paused since {sinceLabel(it.statusChangedAt)}. Reconnecting keeps all your history — you won&apos;t re-pick accounts.</div>
            </div>
          </div>
          <ReconnectButton itemId={it.itemId} onDone={() => mutate()} />
        </div>
      ))}

      {/* Stale-item honesty: a linked bank has gone quiet for >48h. */}
      {staleItems.map((it) => (
        <div key={it.itemId} className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2.5 text-xs text-amber-200/80">
          <Clock size={14} className="shrink-0" />
          <span>{it.institution ?? "A bank"} hasn&apos;t updated since {sinceLabel(it.lastSyncedAt)} — these numbers may be behind. Try Refresh.</span>
        </div>
      ))}

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {data && data.configured === false && (
        <Empty>Bank connections aren&apos;t available yet.</Empty>
      )}
      {!error && !isLoading && !hasAny && data?.configured !== false && (
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
