import type { Quote, Financials, Technicals, EarningsDate } from "@/lib/providers/types";

// =============================================================================
// Transparent scoring engine. NOT "AI says buy" — a rules-based score you can
// read. Each factor produces a 0–100 sub-score from real data; factors whose
// data isn't available yet are marked available:false (and excluded from the
// math) rather than faked. Composite scores are computed per time horizon.
// =============================================================================

export type Horizon = "1W" | "1M" | "1Y" | "5Y";

export interface FactorScore {
  id: string;
  label: string;
  score: number | null; // 0..100, or null if data unavailable
  available: boolean;
  detail: string;
}

export interface StockScore {
  symbol: string;
  price: number | null;
  overall: number; // 0..100
  label: string; // Strong / Favorable / Neutral / Weak / Avoid
  horizons: Record<Horizon, number | null>;
  bestHorizon: Horizon | null;
  factors: FactorScore[];
  earningsInDays: number | null;
  entryZone: string;
  stopLoss: string;
  majorRisk: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

// ---- factor sub-scores ----------------------------------------------------

function trendFactor(q: Quote | null, t: Technicals | null): FactorScore {
  const price = q?.price ?? null;
  if (price == null || !t || (t.sma50 == null && t.sma200 == null)) {
    return { id: "trend", label: "Price trend", score: null, available: false, detail: "Needs price + moving averages." };
  }
  let score = 50;
  if (t.sma50 != null) score += price > t.sma50 ? 17 : -17;
  if (t.sma200 != null) score += price > t.sma200 ? 18 : -18;
  const above = [t.sma50 != null && price > t.sma50, t.sma200 != null && price > t.sma200].filter(Boolean).length;
  return {
    id: "trend",
    label: "Price trend",
    score: clamp(score),
    available: true,
    detail: above === 2 ? "Above 50- and 200-day averages (healthier trend)." : above === 1 ? "Above one key average." : "Below key averages (weaker trend).",
  };
}

function momentumFactor(q: Quote | null, t: Technicals | null): FactorScore {
  if (!q || q.price == null) return { id: "momentum", label: "Momentum", score: null, available: false, detail: "Needs a quote." };
  const rangePos =
    q.week52High != null && q.week52Low != null && q.week52High > q.week52Low
      ? (q.price - q.week52Low) / (q.week52High - q.week52Low)
      : 0.5;
  let score = clamp(50 + (q.changePct ?? 0) * 2 + (rangePos - 0.5) * 40);
  const rsi = t?.rsi14 ?? null;
  let note = "";
  if (rsi != null) {
    if (rsi > 75) { score -= 15; note = ` RSI ${rsi.toFixed(0)} (overbought).`; }
    else if (rsi < 25) { score -= 10; note = ` RSI ${rsi.toFixed(0)} (oversold — risky).`; }
    else note = ` RSI ${rsi.toFixed(0)}.`;
  }
  return { id: "momentum", label: "Momentum", score: clamp(score), available: true, detail: `${(rangePos * 100).toFixed(0)}% of 52-week range.${note}` };
}

function ttm(quarters: Financials["quarters"], pick: (q: Financials["quarters"][number]) => number | null): number | null {
  const last4 = quarters.slice(-4).map(pick).filter((x): x is number => x != null);
  return last4.length === 4 ? last4.reduce((a, b) => a + b, 0) : null;
}

function yoy(quarters: Financials["quarters"], pick: (q: Financials["quarters"][number]) => number | null): number | null {
  if (quarters.length < 5) return null;
  const latest = pick(quarters[quarters.length - 1]);
  const yearAgo = pick(quarters[quarters.length - 5]);
  if (latest == null || yearAgo == null || yearAgo === 0) return null;
  return ((latest - yearAgo) / Math.abs(yearAgo)) * 100;
}

function growthScore(pct: number): number {
  if (pct < 0) return 20;
  if (pct < 10) return 45;
  if (pct < 25) return 70;
  if (pct < 50) return 85;
  return 90;
}

function revenueGrowthFactor(f: Financials | null): FactorScore {
  const g = f ? yoy(f.quarters, (q) => q.revenue) : null;
  if (g == null) return { id: "revGrowth", label: "Revenue growth", score: null, available: false, detail: "Needs 5+ quarters of revenue." };
  return { id: "revGrowth", label: "Revenue growth", score: growthScore(g), available: true, detail: `${g.toFixed(0)}% year-over-year.` };
}

function epsGrowthFactor(f: Financials | null): FactorScore {
  const g = f ? yoy(f.quarters, (q) => q.eps) : null;
  if (g == null) return { id: "epsGrowth", label: "EPS growth", score: null, available: false, detail: "Needs 5+ quarters of EPS." };
  return { id: "epsGrowth", label: "EPS growth", score: growthScore(g), available: true, detail: `${g.toFixed(0)}% year-over-year.` };
}

function valuationFactor(q: Quote | null, f: Financials | null): FactorScore {
  const eps = f ? ttm(f.quarters, (x) => x.eps) : null;
  if (!q || q.price == null || eps == null) return { id: "valuation", label: "Valuation (P/E)", score: null, available: false, detail: "Needs price + trailing EPS." };
  if (eps <= 0) return { id: "valuation", label: "Valuation (P/E)", score: 35, available: true, detail: "No trailing profit — value uncertain." };
  const pe = q.price / eps;
  let score: number;
  if (pe < 10) score = 80;
  else if (pe < 20) score = 75;
  else if (pe < 35) score = 60;
  else if (pe < 60) score = 40;
  else score = 25;
  return { id: "valuation", label: "Valuation (P/E)", score, available: true, detail: `Trailing P/E ≈ ${pe.toFixed(1)}. ${pe < 10 ? "Cheap (check for value traps)." : pe > 60 ? "Richly valued." : "Mid-range."}` };
}

function marginFactor(f: Financials | null): FactorScore {
  const m = f && f.quarters.length ? f.quarters[f.quarters.length - 1].operatingMarginPct : null;
  if (m == null) return { id: "margin", label: "Operating margin", score: null, available: false, detail: "Needs margin data." };
  const score = m < 0 ? 25 : m < 10 ? 50 : m < 20 ? 65 : m < 35 ? 80 : 88;
  return { id: "margin", label: "Operating margin", score, available: true, detail: `${m.toFixed(0)}% operating margin.` };
}

function fcfFactor(f: Financials | null): FactorScore {
  const fcf = f ? ttm(f.quarters, (x) => x.freeCashFlow) : null;
  if (fcf == null) return { id: "fcf", label: "Free cash flow", score: null, available: false, detail: "Needs FCF data." };
  return { id: "fcf", label: "Free cash flow", score: fcf > 0 ? 78 : 35, available: true, detail: fcf > 0 ? "Positive trailing free cash flow." : "Negative trailing free cash flow." };
}

function earningsRiskFactor(days: number | null): FactorScore {
  if (days == null) return { id: "earningsRisk", label: "Earnings proximity", score: null, available: false, detail: "Next earnings date unknown." };
  const score = days <= 7 ? 25 : days <= 21 ? 60 : 85;
  return { id: "earningsRisk", label: "Earnings proximity", score, available: true, detail: days <= 7 ? `Earnings in ${days}d — elevated short-term risk.` : `~${days}d to next earnings.` };
}

// factors the current data adapter can't fill yet — shown as "needs data"
function unavailableFactor(id: string, label: string): FactorScore {
  return { id, label, score: null, available: false, detail: "Add a data source that provides this (e.g. paid FMP / Alpaca)." };
}

// ---- horizon weighting ----------------------------------------------------

const WEIGHTS: Record<Horizon, Record<string, number>> = {
  "1W": { momentum: 0.4, trend: 0.3, earningsRisk: 0.2, unusualVolume: 0.1 },
  "1M": { trend: 0.3, momentum: 0.2, revGrowth: 0.2, earningsRisk: 0.15, valuation: 0.15 },
  "1Y": { valuation: 0.3, revGrowth: 0.25, margin: 0.2, epsGrowth: 0.15, fcf: 0.1 },
  "5Y": { revGrowth: 0.25, margin: 0.2, fcf: 0.2, epsGrowth: 0.15, valuation: 0.2 },
};

function horizonScore(factors: Record<string, FactorScore>, weights: Record<string, number>): number | null {
  let wsum = 0;
  let acc = 0;
  for (const [id, w] of Object.entries(weights)) {
    const fac = factors[id];
    if (fac && fac.available && fac.score != null) {
      acc += fac.score * w;
      wsum += w;
    }
  }
  return wsum > 0 ? clamp(acc / wsum) : null;
}

function labelFor(overall: number): string {
  if (overall >= 75) return "Strong";
  if (overall >= 60) return "Favorable";
  if (overall >= 45) return "Neutral";
  if (overall >= 30) return "Weak";
  return "Avoid";
}

export function computeScore(input: {
  quote: Quote | null;
  financials: Financials | null;
  technicals: Technicals | null;
  earnings: EarningsDate | null;
}): StockScore {
  const { quote, financials, technicals, earnings } = input;
  const days = daysUntil(earnings?.next ?? null);

  const factorList: FactorScore[] = [
    trendFactor(quote, technicals),
    momentumFactor(quote, technicals),
    revenueGrowthFactor(financials),
    epsGrowthFactor(financials),
    valuationFactor(quote, financials),
    marginFactor(financials),
    fcfFactor(financials),
    earningsRiskFactor(days),
    unavailableFactor("debt", "Debt / equity"),
    unavailableFactor("analyst", "Analyst changes"),
    unavailableFactor("unusualVolume", "Unusual volume"),
    unavailableFactor("macd", "MACD"),
  ];
  const byId = Object.fromEntries(factorList.map((f) => [f.id, f]));

  const horizons: Record<Horizon, number | null> = {
    "1W": horizonScore(byId, WEIGHTS["1W"]),
    "1M": horizonScore(byId, WEIGHTS["1M"]),
    "1Y": horizonScore(byId, WEIGHTS["1Y"]),
    "5Y": horizonScore(byId, WEIGHTS["5Y"]),
  };

  const present = (Object.entries(horizons) as [Horizon, number | null][]).filter(([, v]) => v != null) as [Horizon, number][];
  const overall = present.length ? clamp(present.reduce((a, [, v]) => a + v, 0) / present.length) : 0;
  const bestHorizon = present.length ? present.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null;

  // heuristic entry / stop / risk (deterministic, clearly framed as guides)
  const price = quote?.price ?? null;
  const sma50 = technicals?.sma50 ?? null;
  const sma200 = technicals?.sma200 ?? null;
  const entryZone =
    price != null && sma50 != null
      ? `~$${(Math.min(price, sma50) * 0.98).toFixed(2)}–$${Math.max(price, sma50).toFixed(2)} (around the 50-day average)`
      : price != null
        ? `~$${(price * 0.97).toFixed(2)}–$${(price * 1.0).toFixed(2)}`
        : "—";
  const stopLoss =
    sma200 != null ? `below ~$${(sma200 * 0.95).toFixed(2)} (under the 200-day average)` : price != null ? `~$${(price * 0.9).toFixed(2)} (−10%)` : "—";

  const weakest = factorList
    .filter((f) => f.available && f.score != null)
    .sort((a, b) => (a.score! - b.score!))[0];
  const majorRisk =
    days != null && days <= 7 ? `Earnings in ${days} days` : weakest ? `Weakest factor: ${weakest.label.toLowerCase()}` : "Insufficient data";

  return { symbol: quote?.symbol ?? "", price, overall, label: labelFor(overall), horizons, bestHorizon, factors: factorList, earningsInDays: days, entryZone, stopLoss, majorRisk };
}
