"use client";

import useSWR from "swr";
import Link from "next/link";
import { Scale, Info } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Lot {
  symbol: string; shares: number; costBasis: number; marketValue: number | null;
  unrealized: number | null; unrealizedPct: number | null; holdingPeriod: "short" | "long" | "unknown";
  crossesLongTermInDays: number | null;
}
interface TaxResp {
  available: boolean; decemberMode: boolean;
  lens?: {
    lots: Lot[]; totalUnrealized: number; shortTermUnrealized: number; longTermUnrealized: number;
    unknownPeriodCount: number; crossingSoon: Lot[]; harvestCandidates: Lot[];
  };
  asOf?: string;
}
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const tone = (n: number) => (n >= 0 ? "text-emerald-400" : "text-rose-400");

// F7 — Tax lens card on the Portfolio Doctor tab. EDUCATION, not advice.
export function TaxCard() {
  const { data } = useSWR<TaxResp>("/api/tax-lens", fetchJson, { revalidateOnFocus: false });
  if (!data || !data.available || !data.lens) return null;
  const l = data.lens;

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <Scale size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-ink">Tax lens</h2>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-faint">education, not advice</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Unrealized</div>
          <div className={`text-lg font-bold tabular-nums ${tone(l.totalUnrealized)}`}>{money(l.totalUnrealized)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Long-term</div>
          <div className={`text-lg font-bold tabular-nums ${tone(l.longTermUnrealized)}`}>{money(l.longTermUnrealized)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Short-term</div>
          <div className={`text-lg font-bold tabular-nums ${tone(l.shortTermUnrealized)}`}>{money(l.shortTermUnrealized)}</div>
        </div>
      </div>

      {l.unknownPeriodCount > 0 && (
        <p className="mt-2 inline-flex items-start gap-1 text-[11px] text-ink-faint">
          <Info size={12} className="mt-0.5 shrink-0" />
          {l.unknownPeriodCount} position(s) have no acquisition date from your broker, so their holding period is unknown and isn&apos;t split above (never guessed).
        </p>
      )}

      {l.crossingSoon.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <div className="text-xs font-semibold text-amber-300">Approaching long-term (within 60 days)</div>
          <div className="mt-1 space-y-0.5 text-xs text-ink-dim">
            {l.crossingSoon.map((lot) => (
              <div key={lot.symbol}>{lot.symbol} — {lot.crossesLongTermInDays} days to the 1-year line</div>
            ))}
          </div>
        </div>
      )}

      {data.decemberMode && l.harvestCandidates.length > 0 && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface p-3">
          <div className="text-xs font-semibold text-ink">Year-end: positions at a loss</div>
          <p className="mt-1 text-[11px] text-ink-dim">
            These are <em>candidates</em> some investors review for tax-loss harvesting before year-end. This is
            educational only — selling has trade-offs, and a repurchase within 30 days can trigger a{" "}
            <Link href="/glossary#wash-sale" className="text-brand-400 hover:underline">wash sale</Link>. Not advice.
          </p>
          <div className="mt-2 space-y-0.5 text-xs">
            {l.harvestCandidates.slice(0, 5).map((lot) => (
              <div key={lot.symbol} className="flex justify-between">
                <span className="text-ink">{lot.symbol}</span>
                <span className={`tabular-nums ${tone(lot.unrealized ?? 0)}`}>{money(lot.unrealized ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">
        Figures use your broker cost basis{data.asOf ? ` · as of ${new Date(data.asOf).toLocaleDateString()}` : ""}. rukMoney does not compute your taxes or assume tax rates beyond the
        general federal long-term vs short-term distinction. See{" "}
        <Link href="/glossary#ltcg" className="text-brand-400 hover:underline">LTCG/STCG</Link>. Not financial or tax advice.
      </p>
    </div>
  );
}
