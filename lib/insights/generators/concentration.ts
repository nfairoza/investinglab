import type { StructuredInsight } from "../types";
import type { SymbolExposure, SectorExposure } from "@/lib/lookthrough/compute";

// =============================================================================
// F8 delta — concentration insight. Not part of the transaction Ledger (it reads
// holdings), so it's a standalone generator the nightly job runs with a priced
// holdings list. Pure + testable. "NVDA is 31% of your portfolio" — observational,
// never prescriptive. Numbers live in headlineSlots per the engine's law.
// =============================================================================

export interface PricedHolding { symbol: string; value: number }

export function detectConcentration(holdings: PricedHolding[]): StructuredInsight[] {
  const total = holdings.reduce((s, h) => s + (h.value > 0 ? h.value : 0), 0);
  if (total <= 0) return [];
  const top = holdings.filter((h) => h.value > 0).sort((a, b) => b.value - a.value)[0];
  if (!top) return [];
  const pct = (top.value / total) * 100;
  // Non-trivial: a single position over 25% of the portfolio.
  if (pct < 25) return [];
  return [{
    kind: "concentration",
    subject: top.symbol,
    severity: pct >= 40 ? 2 : 1,
    headlineSlots: { symbol: top.symbol, pct: Math.round(pct), value: Math.round(top.value) },
    impactPerYear: null, // concentration is a risk observation, not a $ figure
    evidence: [{
      kind: "inputs",
      inputs: { symbol: top.symbol, positionValue: Math.round(top.value), portfolioValue: Math.round(total) },
      note: `${top.symbol} is about ${Math.round(pct)}% of your ${Math.round(total).toLocaleString("en-US")} portfolio.`,
    }],
    factsUsed: ["concentration.v1"],
    action: { label: "See your holdings", deeplink: "/holdings" },
    cooldownDays: 30,
    page: "holdings",
  }];
}

// E3 — LOOK-THROUGH concentration. Fires when true exposure to a single name or a
// sector (fanned through ETF wrappers) crosses a threshold that the DIRECT view
// misses — e.g. "NVDA is 19% direct, but 26% including SOXL's exposure." Only
// surfaces the delta the direct generator wouldn't already flag, so it doesn't
// double up. Deterministic; numbers live in headlineSlots.
export function detectLookthroughConcentration(
  bySymbol: SymbolExposure[],
  bySector: SectorExposure[],
  totalValue: number,
): StructuredInsight[] {
  if (totalValue <= 0) return [];
  const out: StructuredInsight[] = [];
  const pct = (v: number) => (v / totalValue) * 100;

  // Single-name: look-through ≥ 25% AND materially above direct (≥5pp gap the
  // direct-only generator wouldn't see), with real ETF contribution.
  const topName = [...bySymbol].filter((s) => s.viaEtfs > 0).sort((a, b) => b.total - a.total)[0];
  if (topName) {
    const ltPct = pct(topName.total);
    const directPct = pct(topName.direct);
    if (ltPct >= 25 && ltPct - directPct >= 5) {
      const etfs = topName.sources.map((x) => x.etf).filter((v, i, a) => a.indexOf(v) === i);
      const notional = topName.sources.some((x) => x.notional);
      out.push({
        kind: "lookthrough-concentration",
        subject: topName.symbol,
        severity: ltPct >= 40 ? 2 : 1,
        headlineSlots: { symbol: topName.symbol, ltPct: Math.round(ltPct), directPct: Math.round(directPct) },
        impactPerYear: null,
        evidence: [{
          kind: "inputs",
          inputs: { symbol: topName.symbol, directValue: Math.round(topName.direct), viaEtfValue: Math.round(topName.viaEtfs), portfolioValue: Math.round(totalValue) },
          note: `${topName.symbol} is ${Math.round(directPct)}% directly, but ${Math.round(ltPct)}% once you include ${etfs.join(", ")}${notional ? " (notional, resets daily)" : ""}.`,
        }],
        factsUsed: ["lookthrough.v1"],
        action: { label: "See look-through exposure", deeplink: "/portfolio-doctor" },
        cooldownDays: 30,
        page: "holdings",
      });
    }
  }

  // Sector: same idea at the sector level.
  const topSector = [...bySector].filter((s) => s.viaEtfs > 0).sort((a, b) => b.total - a.total)[0];
  if (topSector) {
    const ltPct = pct(topSector.total);
    const directPct = pct(topSector.direct);
    if (ltPct >= 35 && ltPct - directPct >= 8) {
      out.push({
        kind: "lookthrough-sector",
        subject: topSector.sector,
        severity: ltPct >= 55 ? 2 : 1,
        headlineSlots: { sector: topSector.sector, ltPct: Math.round(ltPct), directPct: Math.round(directPct) },
        impactPerYear: null,
        evidence: [{
          kind: "inputs",
          inputs: { sector: topSector.sector, directValue: Math.round(topSector.direct), viaEtfValue: Math.round(topSector.viaEtfs), portfolioValue: Math.round(totalValue) },
          note: `${topSector.sector} is ${Math.round(directPct)}% directly, but ${Math.round(ltPct)}% once ETF holdings are included.`,
        }],
        factsUsed: ["lookthrough.v1"],
        action: { label: "See look-through exposure", deeplink: "/portfolio-doctor" },
        cooldownDays: 30,
        page: "holdings",
      });
    }
  }

  return out;
}
