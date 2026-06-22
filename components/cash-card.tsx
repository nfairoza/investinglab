"use client";

import { useState } from "react";
import useSWR from "swr";
import { Wallet, Pencil, Check, RefreshCw } from "lucide-react";
import type { CashState } from "@/lib/db";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

// Available-cash card for the dashboard. Shows the saved cash, where it came
// from (manual vs E*TRADE), lets you edit it inline, and (when E*TRADE is
// connected) refresh it from the broker balance. Connection is checked directly
// via /api/etrade/status so the Sync link shows even before the first sync.
export function CashCard() {
  const { data: cash, mutate } = useSWR<CashState>("/api/cash", fetchJson);
  const { data: etrade } = useSWR<{ connected?: boolean; selectedAccountIdKey?: string | null }>("/api/etrade/status", fetchJson, { revalidateOnFocus: false });
  const etradeConnected = Boolean(etrade?.connected && etrade?.selectedAccountIdKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = cash?.amount ?? 0;

  async function save() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) { setEditing(false); return; }
    await fetch("/api/cash", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: n }) });
    setEditing(false);
    mutate();
  }

  async function refreshFromBroker() {
    setBusy(true);
    try {
      await fetch("/api/etrade/balance").catch(() => {});
      mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => { if (etradeConnected && !editing && !busy) refreshFromBroker(); }}
      title={etradeConnected ? "Click to sync cash from E*TRADE" : undefined}
      className={`card-hover rounded-xl glass p-4 ${etradeConnected ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-faint">
          <Wallet size={14} className="text-accent" /> Available cash
          {busy && <RefreshCw size={11} className="animate-spin text-accent" />}
        </div>
        {!editing && (
          <button onClick={(e) => { e.stopPropagation(); setDraft(String(amount)); setEditing(true); }} title="Edit cash"
            className="rounded p-1 text-ink-faint hover:bg-surface hover:text-ink"><Pencil size={13} /></button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-ink-dim">$</span>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            inputMode="decimal"
            className="w-32 rounded-md border border-hairline bg-surface px-2 py-1 text-lg font-semibold text-ink focus:border-brand-500 focus:outline-none" />
          <button onClick={save} className="rounded-md bg-brand-600 p-1.5 text-white hover:bg-brand-500"><Check size={15} /></button>
        </div>
      ) : (
        <div className="mt-1 text-2xl font-semibold text-ink">${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      )}

      <div className="mt-1.5 text-[11px] text-ink-faint">
        {cash?.source === "etrade" ? "From E*TRADE" : "Manual entry"}
        {cash?.updatedAt ? ` · ${new Date(cash.updatedAt).toLocaleDateString()}` : ""}
        {etradeConnected ? " · click card to sync" : ""}
      </div>
    </div>
  );
}
