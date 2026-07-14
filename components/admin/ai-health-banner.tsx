"use client";

import useSWR from "swr";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

// AIOPT A6 — admin AI-provider health banner. Shows a warning when a configured
// provider has been failing >1h (a dead key silently rerouting all traffic to the
// other provider is a cost incident). Green all-clear otherwise. Admin-only card.
interface ProviderHealth { provider: string; lastSuccessAt: string | null; lastError: string | null; failStreak: number; failingSince: string | null }
interface Warning { provider: string; since: string | null; lastError: string | null; streak: number }
interface HealthResp { ai?: { keyPresent: Record<string, boolean>; health: ProviderHealth[]; warnings: Warning[]; aiWarning: boolean } }

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

export function AiHealthBanner() {
  const { data } = useSWR<HealthResp>("/api/connectors/health", fetchJson, { revalidateOnFocus: false, refreshInterval: 60_000 });
  const ai = data?.ai;
  if (!ai) return null;

  if (ai.aiWarning) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle size={16} /> AI provider failing</div>
        <ul className="mt-1 space-y-0.5 text-xs text-amber-200/90">
          {ai.warnings.map((w) => (
            <li key={w.provider}>
              <span className="font-medium capitalize">{w.provider}</span> failing since {ago(w.since)} ({w.streak} in a row) — all traffic is on the other provider.
              {w.lastError ? <span className="text-amber-200/70"> Last: {w.lastError}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-amber-200/70">A dead key silently rerouting 100% of load is a cost incident — check the key + billing.</p>
      </div>
    );
  }

  // All-clear: compact per-provider status.
  const byProvider = Object.fromEntries(ai.health.map((h) => [h.provider, h]));
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 size={16} className="text-emerald-400" /> AI providers healthy</div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-dim">
        {(["claude", "gemini"] as const).map((p) => (
          <span key={p} className="capitalize">
            {p}: {ai.keyPresent[p] ? <span className="text-emerald-300">key set</span> : <span className="text-ink-faint">no key</span>}
            {ai.keyPresent[p] && <span className="text-ink-faint"> · last ok {ago(byProvider[p]?.lastSuccessAt ?? null)}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
