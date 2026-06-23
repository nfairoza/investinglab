"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { usePlaidLink } from "react-plaid-link";
import { Landmark, Plus, Trash2 } from "lucide-react";

// Plaid Link locks body scroll while open and occasionally fails to restore it
// if the flow ends abruptly. Force-restore scroll after Link closes.
function restoreScroll() {
  try {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  } catch { /* ignore */ }
}

interface StatusItem { itemId: string; institution: string; accountCount: number }
interface Status { configured: boolean; items: StatusItem[] }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// Inner button: fetches a link token then opens Plaid Link.
function LinkButton({ label, onLinked }: { label: string; onLinked: () => void }) {
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
      if (!r.ok || j.error) setErr(j.message ?? j.error ?? "Could not link account.");
      else onLinked();
    } finally { setBusy(false); setToken(null); restoreScroll(); }
  }, [onLinked]);

  const onExit = useCallback(() => { setToken(null); restoreScroll(); }, []);

  const { open, ready } = usePlaidLink({ token: token ?? "", onSuccess, onExit });

  async function start() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/plaid/link-token", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.message ?? j.error ?? "Could not start Plaid."); return; }
      try { localStorage.setItem("plaid_link_token", j.link_token); } catch { /* ignore */ }
      setToken(j.link_token);
    } finally { setBusy(false); }
  }

  if (token && ready) open();

  return (
    <div className="space-y-1">
      <button onClick={start} disabled={busy}
        className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-50">
        <Plus size={15} /> {busy ? "Opening…" : label}
      </button>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}

// Settings: STATUS ONLY — which institutions are linked + connect/disconnect.
// Balances, transactions, and spending live on the Money pages, not here.
export function PlaidConnect() {
  const { data: status, mutate } = useSWR<Status>("/api/plaid/status", fetchJson, { revalidateOnFocus: false });

  async function disconnect(itemId: string) {
    await fetch("/api/plaid/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
    mutate();
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
      <div className="flex items-center gap-2">
        <Landmark size={18} className="text-brand-400" />
        <span className="font-medium text-ink">Banks &amp; cards</span>
        <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[10px] text-ink-dim">Read-only</span>
      </div>

      <p className="text-sm text-ink-dim">
        You log in directly with your bank — rukMoney never sees your password. Read-only: we can&apos;t
        move money. Powered by Plaid. Disconnect anytime. View balances and spending under{" "}
        <span className="text-ink">Money</span>.
      </p>

      {/* Connected institutions — names only (status) */}
      {linked.length > 0 && (
        <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">
          {linked.map((it) => (
            <li key={it.itemId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{it.institution}</div>
                <div className="text-[11px] text-ink-faint">{it.accountCount} account{it.accountCount !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => disconnect(it.itemId)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim hover:bg-rose-500/10 hover:text-rose-400">
                <Trash2 size={12} /> Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Always available — connect another institution any time */}
      <LinkButton label={linked.length ? "Connect another bank" : "Connect a bank or card"} onLinked={mutate} />
    </div>
  );
}
