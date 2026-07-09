"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Mail } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Prefs { digestPrefs?: { weekly?: boolean } }
const KEY = "/api/profile-prefs";

// F2 — Settings → Notifications: weekly digest opt-in/out. Writes
// digestPrefs.weekly through profile-prefs (the digest run reads it). Default on.
export function NotificationSettings() {
  const { data } = useSWR<Prefs>(KEY, fetchJson, { revalidateOnFocus: false });
  const weekly = data?.digestPrefs?.weekly ?? true;

  async function setWeekly(next: boolean) {
    globalMutate(KEY, (cur: Prefs | undefined) => ({ ...(cur ?? {}), digestPrefs: { weekly: next } }), { revalidate: false });
    await fetch(KEY, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digestPrefs: { weekly: next } }) }).catch(() => {});
    globalMutate(KEY);
  }

  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <Mail size={16} className="mt-0.5 shrink-0 text-brand-400" />
          <div>
            <div className="text-sm font-medium text-ink">Weekly digest</div>
            <div className="text-xs text-ink-dim">A Sunday recap: net-worth change, top movers, filings from people you follow, and one Rukmani insight. In-app and, if enabled, email.</div>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={weekly}
          onClick={() => setWeekly(!weekly)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${weekly ? "bg-brand-500" : "bg-surface-raised"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${weekly ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
