"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { usePlaidLink } from "react-plaid-link";
import { Landmark, Plus, Trash2, RefreshCw } from "lucide-react";

interface StatusItem { itemId: string; institution: string; accountCount: number }
interface Status { configured: boolean; items: StatusItem[] }
interface BalAccount { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface BalItem { itemId: string; institution: string; accounts: BalAccount[]; error?: string }
interface Balances { items: BalItem[]; totalCash: number }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

function money(n: number | null, cur = "USD") {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
}

// Inner button: fetches a link token then opens Plaid Link.
function LinkButton({ onLinked }: { onLinked: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSuccess = useCallback(async (public_token: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/plaid/exchange", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      const j = await r.json();
      if (!r.ok || j.error) setErr(j.error ?? "Could not link account.");
      else onLinked();
    } finally { setBusy(false); setToken(null); }
  }, [onLinked]);

  const { open, ready } = usePlaidLink({ token: token ?? "", onSuccess });

  async function start() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/plaid/link-token", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error ?? "Could not start Plaid."); return; }
      // Persist the token so a bank OAuth redirect (/plaid/oauth) can resume Link.
      try { localStorage.setItem("plaid_link_token", j.link_token); } catch { /* ignore */ }
      setToken(j.link_token);
    } finally { setBusy(false); }
  }

  // Once we have a token and Link is ready, open it.
  if (token && ready) open();

  return (
    <div className="space-y-1">
      <button onClick={start} disabled={busy}
        className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-50">
        <Plus size={15} /> {busy ? "Opening…" : "Connect a bank"}
      </button>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}

export function PlaidConnect() {
  const { data: status, mutate: mutateStatus } = useSWR<Status>("/api/plaid/status", fetchJson, { revalidateOnFocus: false });
  const { data: balances, mutate: mutateBal, isLoading } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false });

  async function refresh() { await Promise.all([mutateStatus(), mutateBal()]); }

  async function disconnect(itemId: string) {
    await fetch("/api/plaid/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
    refresh();
  }

  if (status && !status.configured) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-4 text-sm text-ink-dim">
        Bank connections aren&apos;t available yet — Plaid isn&apos;t configured.
      </div>
    );
  }

  const linked = status?.items ?? [];

  return (
    <div className="rounded-2xl glass p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark size={18} className="text-brand-400" />
          <span className="font-medium text-ink">Banks &amp; cash</span>
          <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[10px] text-ink-dim">Read-only</span>
        </div>
        {linked.length > 0 && (
          <button onClick={refresh} className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink">
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>

      <p className="text-sm text-ink-dim">
        Securely link your bank accounts via Plaid to see balances, spending, and investments in one place.
        rukMoney never sees your bank login, and access is read-only.
      </p>

      {/* Total cash */}
      {linked.length > 0 && (
        <div className="rounded-xl border border-hairline bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">Total cash (linked banks)</div>
          <div className="mt-0.5 text-2xl font-semibold text-ink">
            {isLoading ? "…" : money(balances?.totalCash ?? 0)}
          </div>
        </div>
      )}

      {/* Connected institutions + balances */}
      {(balances?.items ?? []).map((it) => (
        <div key={it.itemId} className="rounded-xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-ink">{it.institution ?? "Bank"}</div>
            <button onClick={() => disconnect(it.itemId)}
              className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim hover:bg-rose-500/10 hover:text-rose-400">
              <Trash2 size={12} /> Disconnect
            </button>
          </div>
          {it.error ? (
            <p className="mt-2 text-xs text-amber-300">Couldn&apos;t refresh — try reconnecting.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hairline">
              {it.accounts.map((a) => (
                <li key={a.account_id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="truncate text-ink-dim">
                    {a.name}{a.mask ? <span className="text-ink-faint"> ••{a.mask}</span> : null}
                  </span>
                  <span className="shrink-0 font-medium text-ink">{money(a.current, a.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <LinkButton onLinked={refresh} />
    </div>
  );
}
