"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronRight, Info } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useEntitlement } from "@/components/use-entitlement";
import { pctOf, type SymbolExposure, type SectorExposure } from "@/lib/lookthrough/compute";

interface LookthroughResp {
  bySymbol: SymbolExposure[];
  bySector: SectorExposure[];
  totalValue: number;
  computedAt: string;
}

// E3 — the "Look-through" view for the portfolio sector card. A toggle recomputes
// the sector bars through ETF wrappers ("Semiconductors: 41% look-through vs 28%
// direct — SOXL adds NVDA/AVGO/AMD"). Premium-gated (etf_lookthrough); while
// billing is off, everyone gets it. `directSectors` is the existing direct view.
export function LookthroughSectors({ directSectors }: { directSectors: { sector: string; pct: number }[] }) {
  const entitled = useEntitlement("etf_lookthrough");
  const [on, setOn] = useState(false);
  const { data } = useSWR<LookthroughResp>(on ? "/api/lookthrough" : null, fetchJson, { revalidateOnFocus: false });

  const total = data?.totalValue ?? 0;
  const ltSectors = (data?.bySector ?? []).map((s) => ({ sector: s.sector, pct: pctOf(s.total, total), direct: pctOf(s.direct, total) }));
  const directMap = new Map(directSectors.map((s) => [s.sector, s.pct]));

  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">Sector exposure</div>
        {entitled && (
          <button
            onClick={() => setOn((v) => !v)}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${on ? "border-brand-500/50 bg-brand-500/10 text-brand-300" : "border-hairline text-ink-dim hover:text-ink"}`}
          >
            {on ? "Look-through ✓" : "Look-through"}
          </button>
        )}
      </div>
      {on && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Info size={11} /> Exposure fanned through your ETFs to what they actually hold.
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {(on && ltSectors.length ? ltSectors : directSectors.map((s) => ({ ...s, direct: s.pct }))).map((s) => {
          const directPct = on ? (directMap.get(s.sector) ?? s.direct) : s.pct;
          const showDelta = on && Math.abs(s.pct - directPct) >= 1;
          return (
            <div key={s.sector} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 truncate text-ink-dim">{s.sector}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, s.pct)}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs text-ink-dim">
                {s.pct.toFixed(0)}%
                {showDelta && <span className="text-ink-faint"> vs {directPct.toFixed(0)}%</span>}
              </span>
            </div>
          );
        })}
      </div>

      {on && data && <TopExposures bySymbol={data.bySymbol} total={total} />}
    </div>
  );
}

// Evidence expander: top look-through single-name exposures with the direct-vs-
// look-through breakdown and which ETFs contributed.
function TopExposures({ bySymbol, total }: { bySymbol: SymbolExposure[]; total: number }) {
  const [open, setOpen] = useState(false);
  const top = bySymbol.filter((s) => s.viaEtfs > 0).slice(0, 8);
  if (!top.length) return null;
  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-brand-300 hover:underline">
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        Show the math — top look-through names
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {top.map((s) => (
            <div key={s.symbol} className="text-xs text-ink-dim">
              <span className="font-mono font-semibold text-ink">{s.symbol}</span>{" "}
              {pctOf(s.total, total).toFixed(1)}% look-through
              <span className="text-ink-faint"> ({pctOf(s.direct, total).toFixed(1)}% direct + {pctOf(s.viaEtfs, total).toFixed(1)}% via {s.sources.map((x) => x.etf).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</span>
              {s.sources.some((x) => x.notional) && <span className="text-amber-500"> · notional, resets daily</span>}
              <span className="text-ink-faint">)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
