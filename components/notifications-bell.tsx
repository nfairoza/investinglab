"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Inbox, Check } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

const KEY = "/api/notifications";
interface Notif { id: string; kind: string; payload: { title: string; body: string; deeplink: string }; read_at: string | null; created_at: string }

// General notifications inbox (F1) behind an inbox icon in the top bar. Polls the
// same endpoint the detection cron writes to. Distinct from the price-alerts bell
// (which manages watch alerts) — this carries follow filings, digests, recurring
// charges, etc. Push delivery lands with MOBILE_APP M1.2.
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ notifications: Notif[]; unread: number }>(KEY, fetchJson, { revalidateOnFocus: true, refreshInterval: 120_000 });
  const items = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  async function markAll() {
    globalMutate(KEY, (cur: any) => cur ? { ...cur, notifications: cur.notifications.map((n: Notif) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })), unread: 0 } : cur, { revalidate: false });
    await fetch(KEY, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) }).catch(() => {});
    globalMutate(KEY);
  }

  // ALERTDEL — opening the feed counts as "seen": mark every unseen alert delivery
  // seen so the escalation job won't email about alerts the user has now looked at.
  function markDeliveriesSeen() {
    fetch("/api/alerts/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seenAll: true }) }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        onClick={() => { const opening = !open; setOpen((v) => !v); if (opening) { markDeliveriesSeen(); if (unread > 0) markAll(); } }}
        aria-label={unread > 0 ? `Notifications — ${unread} unread` : "Notifications"}
        title="Notifications"
        className="relative rounded-md p-2 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
      >
        <Inbox size={18} />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-[14px] rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-[14px] text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-hairline bg-surface-solid shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              {items.some((n) => !n.read_at) && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink"><Check size={12} /> Mark all read</button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-faint">You&apos;re all caught up.</p>
              ) : (
                items.map((n) => (
                  <a key={n.id} href={n.payload.deeplink} onClick={() => setOpen(false)}
                    className={`block border-b border-hairline/60 px-3 py-2.5 transition-colors hover:bg-surface ${n.read_at ? "" : "bg-brand-500/[0.05]"}`}>
                    <div className="text-xs font-semibold text-ink">{n.payload.title}</div>
                    <div className="mt-0.5 text-xs text-ink-dim">{n.payload.body}</div>
                    <div className="mt-1 text-[10px] text-ink-faint">{new Date(n.created_at).toLocaleDateString()}</div>
                  </a>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
