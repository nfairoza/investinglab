"use client";

import { useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { RefreshCw } from "lucide-react";

// Reconnect a de-authed Plaid item via Link UPDATE MODE. Requests an
// access_token-scoped link token (?update=itemId), opens Link so the user
// re-authenticates WITHOUT re-picking accounts, then calls reauth-complete which
// clears the reauth flag on a successful sync. No new Item, no data loss.
function restoreScroll() {
  const reset = () => {
    try {
      for (const el of [document.body, document.documentElement]) {
        el.style.overflow = ""; el.style.position = ""; el.style.top = ""; el.style.width = ""; el.style.height = "";
      }
    } catch { /* ignore */ }
  };
  reset(); setTimeout(reset, 300);
}

export function ReconnectButton({ itemId, onDone }: { itemId: string; onDone?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/plaid/reauth-complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      }).catch(() => {});
      onDone?.();
    } finally { setBusy(false); setToken(null); restoreScroll(); }
  }, [itemId, onDone]);

  const onExit = useCallback(() => { setToken(null); restoreScroll(); }, []);
  const { open, ready } = usePlaidLink({ token: token ?? "", onSuccess, onExit });
  if (token && ready) open();

  async function start() {
    setBusy(true);
    try {
      const r = await fetch(`/api/plaid/link-token?update=${encodeURIComponent(itemId)}`, { method: "POST" });
      const j = await r.json();
      if (r.ok && j.link_token) setToken(j.link_token);
    } finally { setBusy(false); }
  }

  return (
    <button onClick={start} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-60">
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Opening…" : "Reconnect"}
    </button>
  );
}
