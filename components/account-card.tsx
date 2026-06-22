"use client";

import { useState } from "react";
import useSWR from "swr";
import { User, Shield, LogOut, Trash2 } from "lucide-react";

interface Me { authenticated?: boolean; isAdmin?: boolean; email?: string | null; }

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

// Account card for Settings: shows the signed-in email, sign-in provider, admin
// badge, sign out, and delete account.
export function AccountCard() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deleteAccount() {
    setDeleting(true); setErr(null);
    try {
      const r = await fetch("/api/account/delete", { method: "POST" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr((j as any).message ?? "Could not delete account."); return; }
      window.location.href = "/login";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally { setDeleting(false); }
  }

  return (
    <div className="rounded-xl glass p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <User size={16} className="text-accent" /> Account
      </div>

      <div className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
          <span className="text-ink-faint">Email</span>
          <span className="text-ink">{me?.email ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
          <span className="text-ink-faint">Role</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${me?.isAdmin ? "border-brand-500/50 text-brand-300" : "border-hairline text-ink-dim"}`}>
            {me?.isAdmin && <Shield size={11} />}{me?.isAdmin ? "Administrator" : "Member"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action="/auth/signout" method="post">
          <button type="submit" className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink">
            <LogOut size={14} /> Sign out
          </button>
        </form>

        {!confirming ? (
          <button onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10">
            <Trash2 size={14} /> Delete account
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-1.5">
            <span className="text-xs text-rose-300">Delete everything permanently?</span>
            <button onClick={deleteAccount} disabled={deleting}
              className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50">
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
          </div>
        )}
      </div>
      {err && <p className="mt-2 text-[11px] text-rose-400">{err}</p>}
      <p className="mt-3 text-[11px] text-ink-faint">Deleting removes your holdings, watchlist, alerts, cash, and connections — permanently.</p>
    </div>
  );
}
