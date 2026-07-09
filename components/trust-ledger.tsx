"use client";

import useSWR from "swr";
import { Trophy } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Outcome { kind: string; subject: string; source: string; capturedYear: number; note: string | null; createdAt: string }
interface LedgerResp { flaggedYear: number; capturedYear: number; count: number; recent: Outcome[] }

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Stage-4 trust ledger: "rukMoney has flagged $X/yr of opportunities; you've
// captured $Y." The running total that makes the value tangible. Self-hides
// until there's at least one captured outcome.
export function TrustLedger() {
  const { data } = useSWR<LedgerResp>("/api/insights/outcomes", fetchJson, { revalidateOnFocus: false });
  if (!data || data.count === 0) return null;

  const pct = data.flaggedYear > 0 ? Math.min(100, Math.round((data.capturedYear / data.flaggedYear) * 100)) : 0;

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <Trophy size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-ink">Your progress</h2>
      </div>
      <p className="text-sm text-ink-dim">
        rukMoney has flagged <span className="font-semibold text-ink">{money(data.flaggedYear)}/yr</span> of opportunities.
        You&apos;ve captured <span className="font-semibold text-emerald-400">{money(data.capturedYear)}/yr</span>.
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {data.recent.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {data.recent.map((o, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink-dim">{o.note ?? o.subject}</span>
              <span className="shrink-0 tabular-nums text-emerald-400">+{money(o.capturedYear)}/yr</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
