"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Mail, BellRing } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Prefs { digestPrefs?: { weekly?: boolean }; notifyPrefs?: { missedAlertEmail?: boolean } }
const KEY = "/api/profile-prefs";

// F2 + ALERTDEL — Settings → Notifications. Weekly digest opt-in/out and the
// "email me about missed alerts" fallback toggle. Both write through
// profile-prefs; the digest + escalation crons read them. Both default ON.
export function NotificationSettings() {
  const { data } = useSWR<Prefs>(KEY, fetchJson, { revalidateOnFocus: false });
  const weekly = data?.digestPrefs?.weekly ?? true;
  const missedAlertEmail = data?.notifyPrefs?.missedAlertEmail ?? true;

  async function setWeekly(next: boolean) {
    globalMutate(KEY, (cur: Prefs | undefined) => ({ ...(cur ?? {}), digestPrefs: { weekly: next } }), { revalidate: false });
    await fetch(KEY, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digestPrefs: { weekly: next } }) }).catch(() => {});
    globalMutate(KEY);
  }

  async function setMissedAlertEmail(next: boolean) {
    globalMutate(KEY, (cur: Prefs | undefined) => ({ ...(cur ?? {}), notifyPrefs: { ...(cur?.notifyPrefs ?? {}), missedAlertEmail: next } }), { revalidate: false });
    await fetch(KEY, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifyPrefs: { missedAlertEmail: next } }) }).catch(() => {});
    globalMutate(KEY);
  }

  return (
    <div className="space-y-3">
      <ToggleRow
        icon={<Mail size={16} className="mt-0.5 shrink-0 text-brand-400" />}
        title="Weekly digest"
        desc="A Sunday recap: net-worth change, top movers, filings from people you follow, and one Rukmani insight. In-app and, if enabled, email."
        checked={weekly}
        onChange={setWeekly}
      />
      <ToggleRow
        icon={<BellRing size={16} className="mt-0.5 shrink-0 text-brand-400" />}
        title="Email me about missed alerts"
        desc="If an alert's push notification goes unseen for a couple of hours, we'll send a single email summarizing what you may have missed. Turn off for push + in-app only."
        checked={missedAlertEmail}
        onChange={setMissedAlertEmail}
      />
    </div>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange }: { icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-2.5">
          {icon}
          <div>
            <div className="text-sm font-medium text-ink">{title}</div>
            <div className="text-xs text-ink-dim">{desc}</div>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-surface-raised"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
