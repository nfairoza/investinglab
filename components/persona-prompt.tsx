"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Coins, Search, Landmark } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

export type Persona = "money" | "research" | "power";

interface Prefs { personaSet?: boolean; persona?: Persona | null }

// One-question onboarding shown once on Home before the Overview: "What brings
// you here?" The answer (stored in profile-prefs.persona) ONLY reorders/empasizes
// Home cards + tweaks the setup checklist — it never hides anything. Skippable.
// Renders nothing once personaSet is true (or while prefs load, to avoid a flash).
const OPTIONS: { key: Persona; title: string; blurb: string; icon: typeof Coins }[] = [
  { key: "money", title: "Track my money", blurb: "Accounts, spending, net worth in one place", icon: Coins },
  { key: "research", title: "Research stocks", blurb: "Scores, memos, screeners & predictions", icon: Search },
  { key: "power", title: "Follow insider & Congress trades", blurb: "Power Trades — who's buying what", icon: Landmark },
];

async function save(persona: Persona | null) {
  // Optimistically mark set so the prompt closes instantly.
  globalMutate("/api/profile-prefs", (p: Prefs | undefined) => ({ ...(p ?? {}), personaSet: true, persona }), { revalidate: false });
  await fetch("/api/profile-prefs", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona, personaSet: true }),
  }).catch(() => {});
  globalMutate("/api/profile-prefs");
}

export function PersonaPrompt() {
  const { data: prefs } = useSWR<Prefs>("/api/profile-prefs", fetchJson, { revalidateOnFocus: false });
  if (!prefs || prefs.personaSet) return null;

  return (
    <div className="rounded-2xl glass p-6 sm:p-8">
      <h1 className="font-display text-2xl font-semibold text-ink">What brings you here?</h1>
      <p className="mt-1 text-sm text-ink-dim">We&apos;ll tailor your home screen. Everything stays available either way — change it anytime in Settings.</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => save(o.key)}
            className="card-hover rounded-2xl border border-hairline bg-surface p-5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised">
              <o.icon size={20} className="text-brand-400" />
            </span>
            <div className="mt-3 text-sm font-semibold text-ink">{o.title}</div>
            <div className="mt-0.5 text-xs text-ink-dim">{o.blurb}</div>
          </button>
        ))}
      </div>
      <button onClick={() => save(null)} className="mt-4 text-xs text-ink-faint hover:text-ink-dim">Just exploring — skip</button>
    </div>
  );
}
