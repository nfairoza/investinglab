"use client";

import useSWR from "swr";
import Link from "next/link";
import { Users } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

// PT6 — portfolio overlap card. "People you follow traded stocks you own."
// Self-hides when there's no overlap. Zero API cost (all local tables).
interface Match {
  personName: string; ticker: string; type: "buy" | "sell"; amountLabel: string | null;
  disclosureDate: string | null; heldValue: number;
}
const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function OverlapCard({ compact = false }: { compact?: boolean }) {
  const { data } = useSWR<{ matches: Match[] }>("/api/power-trades/overlap", fetchJson, { revalidateOnFocus: false });
  const matches = data?.matches ?? [];
  if (matches.length === 0) return null;

  const shown = compact ? matches.slice(0, 3) : matches.slice(0, 8);
  return (
    <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Users size={15} className="text-brand-400" /> People you follow traded stocks you own</div>
      <ul className="mt-2 divide-y divide-white/5">
        {shown.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 truncate text-ink-dim">
              <span className="text-ink">{m.personName}</span> {m.type === "buy" ? "bought" : "sold"}{" "}
              <Link href={`/research?symbol=${m.ticker}`} className="font-mono text-brand-300 hover:underline">{m.ticker}</Link>
              {m.amountLabel ? <span className="text-ink-faint"> · {m.amountLabel}</span> : null}
            </span>
            <span className="shrink-0 text-[11px] text-ink-faint">you hold {money(m.heldValue)}</span>
          </li>
        ))}
      </ul>
      {compact && matches.length > shown.length && (
        <Link href="/power-trades?tab=flow" className="mt-2 block text-xs text-brand-300 hover:underline">See all {matches.length} →</Link>
      )}
    </div>
  );
}
