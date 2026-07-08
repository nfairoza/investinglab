"use client";

import { useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Check, X, Landmark, TrendingUp, Sparkles, UserCheck } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Prefs { setupDismissed?: boolean; askedRukmani?: boolean }

// First-run setup checklist pinned to the top of the Overview. Shows progress
// through the four things that make the app useful. Auto-hides once all steps are
// done, or when the user dismisses it (persisted in profile-prefs). Completion is
// derived from real data the Overview already has (bank connected / ticker added)
// plus a prefs flag for "asked Rukmani".
export function SetupChecklist({ hasBank, hasTicker }: { hasBank: boolean; hasTicker: boolean }) {
  const { data: prefs } = useSWR<Prefs>("/api/profile-prefs", fetchJson, { revalidateOnFocus: false });

  const steps = useMemo(() => [
    { key: "account", label: "Create your account", done: true, icon: UserCheck, action: null as null | (() => void), cta: "" },
    { key: "bank", label: "Connect a bank or brokerage", done: hasBank, icon: Landmark, action: () => window.dispatchEvent(new Event("open-add")), cta: "Connect" },
    { key: "ticker", label: "Add a stock to your watchlist", done: hasTicker, icon: TrendingUp, action: () => { window.location.href = "/watchlist"; }, cta: "Add" },
    { key: "rukmani", label: "Ask Rukmani a question", done: Boolean(prefs?.askedRukmani), icon: Sparkles, action: askRukmani, cta: "Ask" },
  ], [hasBank, hasTicker, prefs]);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  // Hide when complete or explicitly dismissed. (Wait for prefs so it doesn't
  // flash before we know the dismissal state.)
  if (!prefs || prefs.setupDismissed || allDone) return null;

  async function dismiss() {
    // Optimistically hide, then persist.
    globalMutate("/api/profile-prefs", { ...(prefs ?? {}), setupDismissed: true }, { revalidate: false });
    await fetch("/api/profile-prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupDismissed: true }) }).catch(() => {});
  }

  function askRukmani() {
    // Mark the step done + open the assistant with a starter prompt.
    fetch("/api/profile-prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ askedRukmani: true }) })
      .then(() => globalMutate("/api/profile-prefs")).catch(() => {});
    window.dispatchEvent(new CustomEvent("ask-rukmani", { detail: { prompt: "What can you help me with?" } }));
  }

  return (
    <div className="rounded-2xl glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles size={15} className="text-brand-400" /> Finish setting up
          </div>
          <p className="mt-0.5 text-xs text-ink-dim">{doneCount} of {steps.length} done — a few steps to get the full picture.</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss setup checklist" className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink">
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full bg-brand-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-500/20 text-emerald-400" : "bg-surface-raised text-ink-faint"}`}>
              {s.done ? <Check size={14} /> : <s.icon size={13} />}
            </span>
            <span className={`flex-1 text-sm ${s.done ? "text-ink-faint line-through" : "text-ink"}`}>{s.label}</span>
            {!s.done && s.action && (
              <button onClick={s.action} className="rounded-md border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink-dim hover:bg-surface hover:text-ink">
                {s.cta}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
