"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { usePlaidLink } from "react-plaid-link";
import { Landmark, Plus, Trash2, ChevronDown } from "lucide-react";

// Plaid Link locks page scroll while open (sets overflow/position on body) and
// occasionally fails to restore it if the flow ends abruptly. Fully reset the
// styles it touches — twice, since the SDK may re-apply during teardown.
function restoreScroll() {
  const reset = () => {
    try {
      for (const el of [document.body, document.documentElement]) {
        el.style.overflow = "";
        el.style.position = "";
        el.style.top = "";
        el.style.width = "";
        el.style.height = "";
      }
    } catch { /* ignore */ }
  };
  reset();
  setTimeout(reset, 300);
}

interface StatusAccount { name: string; mask: string | null; type: string | null; subtype: string | null }
interface StatusItem { itemId: string; institution: string; logo: string | null; color: string | null; accountCount: number; accounts: StatusAccount[] }
interface Status { configured: boolean; items: StatusItem[] }

const TYPE_LABEL: Record<string, string> = {
  depository: "Cash", credit: "Credit card", loan: "Loan", investment: "Investment", brokerage: "Brokerage", other: "Account",
};

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
      else {
        onLinked();
        // Kick a transactions sync in the background so Spending/Overview have
        // data without waiting for the user to open the Transactions page.
        fetch("/api/plaid/transactions").catch(() => {});
      }
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
        <span className="font-medium text-ink">Linked institutions</span>
        <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[10px] text-ink-dim">Read-only</span>
      </div>

      <p className="text-sm text-ink-dim">
        Link any financial institution — banks, credit cards, brokerages (Robinhood, E*TRADE),
        and retirement (Fidelity, Vanguard). You log in directly with them; rukMoney never sees your
        password and can&apos;t move money. Powered by Plaid. View balances and spending under{" "}
        <span className="text-ink">Money</span>.
      </p>

      {/* Connected institutions — collapsed by default; click to see accounts */}
      {linked.length > 0 && (
        <div className="space-y-2">
          {linked.map((it) => (
            <InstitutionRow key={it.itemId} item={it} onDisconnect={() => disconnect(it.itemId)} />
          ))}
        </div>
      )}

      {/* Always available — connect another institution any time */}
      <LinkButton label={linked.length ? "Connect another institution" : "Connect an institution"} onLinked={mutate} />
    </div>
  );
}

// One institution: collapsed by default (name + count), expands its accounts on click.
function InstitutionRow({ item, onDisconnect }: { item: StatusItem; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
          <ChevronDown size={15} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
          <InstitutionLogo logo={item.logo} color={item.color} name={item.institution} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{item.institution}</span>
            <span className="block text-[11px] text-ink-faint">{item.accountCount} account{item.accountCount !== 1 ? "s" : ""}</span>
          </span>
        </button>
        <button onClick={onDisconnect}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim hover:bg-rose-500/10 hover:text-rose-400">
          <Trash2 size={12} /> Disconnect
        </button>
      </div>
      {open && item.accounts.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {item.accounts.map((a, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="truncate text-ink-dim">{a.name}{a.mask ? <span className="text-ink-faint"> ••{a.mask}</span> : null}</span>
              <span className="shrink-0 text-[11px] text-ink-faint">{TYPE_LABEL[a.type ?? "other"] ?? a.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Institution logo (Plaid base64 PNG) with a colored-initial fallback.
function InstitutionLogo({ logo, color, name }: { logo: string | null; color: string | null; name: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-md border border-hairline object-contain bg-white p-0.5" />;
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
      style={{ background: color || "var(--accent)" }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
