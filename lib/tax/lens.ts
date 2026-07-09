// =============================================================================
// F7 — Tax lens (EDUCATION, not advice). Pure computations from cost basis +
// (where available) acquisition dates. We never compute a user's actual taxes
// and assume no rates beyond the generic federal long-term / short-term
// distinction, labeled as such.
//
// Reality of our data: Plaid holdings give a position-level cost basis, not
// per-lot acquisition dates. So the short/long-term split is only computed when
// a lot date is present; otherwise the position is labeled "holding period
// unknown" and NOT guessed. Unrealized gain/loss and December tax-loss-harvest
// candidates (positions at a loss) work from cost basis alone.
// =============================================================================

export interface TaxPosition {
  symbol: string;
  shares: number;
  avgCost: number;          // per-share cost basis (0 if unknown)
  price: number | null;     // current per-share price
  acquiredDate?: string | null; // YYYY-MM-DD if a lot date is known, else null
}

export type HoldingPeriod = "short" | "long" | "unknown";

export interface TaxLot {
  symbol: string;
  shares: number;
  costBasis: number;        // total $ basis
  marketValue: number | null;
  unrealized: number | null; // marketValue - costBasis
  unrealizedPct: number | null;
  holdingPeriod: HoldingPeriod;
  crossesLongTermInDays: number | null; // days until the 1yr line, if short + dated
}

const DAY_MS = 86_400_000;

export function classifyHoldingPeriod(acquiredDate: string | null | undefined, nowMs: number): { period: HoldingPeriod; daysHeld: number | null } {
  if (!acquiredDate) return { period: "unknown", daysHeld: null };
  const acquiredMs = new Date(`${acquiredDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(acquiredMs)) return { period: "unknown", daysHeld: null };
  const daysHeld = Math.floor((nowMs - acquiredMs) / DAY_MS);
  return { period: daysHeld > 365 ? "long" : "short", daysHeld };
}

export function computeTaxLot(p: TaxPosition, nowMs: number): TaxLot {
  const costBasis = +(p.shares * p.avgCost).toFixed(2);
  const marketValue = p.price != null ? +(p.shares * p.price).toFixed(2) : null;
  const unrealized = marketValue != null && p.avgCost > 0 ? +(marketValue - costBasis).toFixed(2) : null;
  const unrealizedPct = unrealized != null && costBasis > 0 ? +((unrealized / costBasis) * 100).toFixed(2) : null;
  const { period, daysHeld } = classifyHoldingPeriod(p.acquiredDate, nowMs);
  // Days until the position crosses into long-term (only meaningful if short + dated).
  const crossesLongTermInDays = period === "short" && daysHeld != null ? Math.max(0, 366 - daysHeld) : null;
  return { symbol: p.symbol, shares: p.shares, costBasis, marketValue, unrealized, unrealizedPct, holdingPeriod: period, crossesLongTermInDays };
}

export interface TaxLensResult {
  lots: TaxLot[];
  totalUnrealized: number;         // sum where known
  shortTermUnrealized: number;     // only where holding period known
  longTermUnrealized: number;
  unknownPeriodCount: number;      // positions we couldn't classify (honesty)
  crossingSoon: TaxLot[];          // short-term lots within 60 days of long-term
  harvestCandidates: TaxLot[];     // positions at a loss (Dec mode surfaces these)
}

export function buildTaxLens(positions: TaxPosition[], nowMs: number): TaxLensResult {
  const lots = positions.map((p) => computeTaxLot(p, nowMs)).filter((l) => l.costBasis > 0);
  let totalUnrealized = 0, shortTermUnrealized = 0, longTermUnrealized = 0, unknownPeriodCount = 0;
  for (const l of lots) {
    if (l.unrealized != null) {
      totalUnrealized += l.unrealized;
      if (l.holdingPeriod === "short") shortTermUnrealized += l.unrealized;
      else if (l.holdingPeriod === "long") longTermUnrealized += l.unrealized;
    }
    if (l.holdingPeriod === "unknown") unknownPeriodCount++;
  }
  const crossingSoon = lots.filter((l) => l.crossesLongTermInDays != null && l.crossesLongTermInDays <= 60);
  const harvestCandidates = lots.filter((l) => l.unrealized != null && l.unrealized < 0).sort((a, b) => (a.unrealized ?? 0) - (b.unrealized ?? 0));
  return {
    lots,
    totalUnrealized: +totalUnrealized.toFixed(2),
    shortTermUnrealized: +shortTermUnrealized.toFixed(2),
    longTermUnrealized: +longTermUnrealized.toFixed(2),
    unknownPeriodCount,
    crossingSoon,
    harvestCandidates,
  };
}

// Dec mode: Nov 15 – Dec 31 (tax-loss-harvesting education window).
export function isDecemberMode(nowMs: number): boolean {
  const d = new Date(nowMs);
  const m = d.getUTCMonth(); // 0-based; 10 = Nov, 11 = Dec
  if (m === 11) return true;
  if (m === 10 && d.getUTCDate() >= 15) return true;
  return false;
}
