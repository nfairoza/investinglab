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
  changePct: number | null; // today's actual % move (real data, not a forecast)
  overall: number; // 0..100
  label: string; // Strong / Favorable / Neutral / Weak / Avoid
  horizons: Record<Horizon, number | null>;
  bestHorizon: Horizon | null;
  factors: FactorScore[];
  earningsInDays: number | null;
  entryZone: string;
  stopLoss: string;
  majorRisk: string;
  topReason: string; // strongest available factor's plain-English detail (the "why")
}

// Translate a 0–100 horizon score into a human directional bias + a rough
// expected-move BAND (estimate, deliberately a range — not fake precision).
// Bands widen for longer horizons because uncertainty compounds.
export type Bias = "bullish" | "neutral" | "bearish";
const HORIZON_SWING: Record<Horizon, number> = { "1W": 4, "1M": 9, "1Y": 25, "5Y": 60 };

export function horizonOutlook(score: number | null, h: Horizon): { bias: Bias; word: string; expectedMove: string } {
  if (score == null) return { bias: "neutral", word: "No data", expectedMove: "—" };
  const swing = HORIZON_SWING[h];
  // Map score (0–100) to a signed bias strength (-1..1) centered at 50.
  const strength = (score - 50) / 50; // -1..1
  const mid = strength * swing; // signed expected midpoint move %
  const lo = mid - swing * 0.5;
  const hi = mid + swing * 0.5;
  const bias: Bias = score >= 58 ? "bullish" : score <= 42 ? "bearish" : "neutral";
  const word = bias === "bullish" ? "Lean up" : bias === "bearish" ? "Lean down" : "Range-bound";
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
  const expectedMove = `${fmt(lo)} to ${fmt(hi)}`;
  return { bias, word, expectedMove };
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

function debtFactor(t: Technicals | null): FactorScore {
  const de = t?.debtToEquity ?? null;
  if (de == null) return { id: "debt", label: "Debt / equity", score: null, available: false, detail: "Debt/equity unavailable." };
  // Lower leverage = safer. D/E here is a ratio (e.g. 0.5 = 50%).
  const score = de < 0.3 ? 85 : de < 0.6 ? 72 : de < 1 ? 58 : de < 2 ? 40 : 25;
  return { id: "debt", label: "Debt / equity", score, available: true, detail: `Debt/equity ≈ ${de.toFixed(2)}. ${de < 0.6 ? "Conservatively financed." : de > 2 ? "Highly leveraged." : "Moderate leverage."}` };
}

function analystFactor(t: Technicals | null): FactorScore {
  const a = t?.analystAction ?? null;
  if (!a || !a.action) return { id: "analyst", label: "Analyst changes", score: null, available: false, detail: "No recent analyst action." };
  const act = a.action.toLowerCase();
  const score = act.includes("upgrade") ? 80 : act.includes("downgrade") ? 30 : 55;
  return { id: "analyst", label: "Analyst changes", score, available: true, detail: `${a.firm}: ${a.action}${a.date ? ` (${a.date})` : ""}.` };
}

function unusualVolumeFactor(q: Quote | null, t: Technicals | null): FactorScore {
  const vol = t?.volume ?? q?.volume ?? null;
  const avg = t?.avgVolume ?? null;
  if (vol == null || avg == null || avg <= 0) return { id: "unusualVolume", label: "Unusual volume", score: null, available: false, detail: "Volume vs average unavailable." };
  const ratio = vol / avg;
  // High relative volume = conviction behind the move; very low = apathy.
  const score = ratio > 2 ? 80 : ratio > 1.3 ? 68 : ratio > 0.7 ? 55 : 42;
  return { id: "unusualVolume", label: "Unusual volume", score, available: true, detail: `${ratio.toFixed(1)}× average volume today.` };
}

function macdFactor(t: Technicals | null): FactorScore {
  const m = t?.macd ?? null;
  if (m == null) return { id: "macd", label: "MACD", score: null, available: false, detail: "MACD unavailable." };
  // Positive histogram = bullish momentum; magnitude is informative but we keep it simple.
  const score = m > 0 ? 70 : 40;
  return { id: "macd", label: "MACD", score, available: true, detail: m > 0 ? `Bullish (histogram +${m.toFixed(2)}).` : `Bearish (histogram ${m.toFixed(2)}).` };
}

// ---- horizon weighting ----------------------------------------------------

const WEIGHTS: Record<Horizon, Record<string, number>> = {
  // Short term leans on momentum/technicals (now incl. MACD + unusual volume + analyst).
  "1W": { momentum: 0.3, trend: 0.22, macd: 0.15, unusualVolume: 0.1, earningsRisk: 0.13, analyst: 0.1 },
  "1M": { trend: 0.25, momentum: 0.18, macd: 0.1, revGrowth: 0.17, earningsRisk: 0.12, valuation: 0.12, analyst: 0.06 },
  // Long term leans on fundamentals (now incl. balance-sheet health via debt/equity).
  "1Y": { valuation: 0.28, revGrowth: 0.22, margin: 0.18, epsGrowth: 0.12, fcf: 0.1, debt: 0.1 },
  "5Y": { revGrowth: 0.24, margin: 0.18, fcf: 0.18, epsGrowth: 0.14, valuation: 0.16, debt: 0.1 },
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
    debtFactor(technicals),
    analystFactor(technicals),
    unusualVolumeFactor(quote, technicals),
    macdFactor(technicals),
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

  const available = factorList.filter((f) => f.available && f.score != null);
  const weakest = [...available].sort((a, b) => (a.score! - b.score!))[0];
  const strongest = [...available].sort((a, b) => (b.score! - a.score!))[0];
  const majorRisk =
    days != null && days <= 7 ? `Earnings in ${days} days` : weakest ? `Weakest factor: ${weakest.label.toLowerCase()}` : "Insufficient data";
  const topReason = strongest ? `${strongest.label}: ${strongest.detail}` : "Not enough data to explain the score yet.";

  return {
    symbol: quote?.symbol ?? "",
    price,
    changePct: quote?.changePct ?? null,
    overall,
    label: labelFor(overall),
    horizons,
    bestHorizon,
    factors: factorList,
    earningsInDays: days,
    entryZone,
    stopLoss,
    majorRisk,
    topReason,
  };
}
