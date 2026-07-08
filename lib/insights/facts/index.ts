import type { Ledger, Fact, EvidenceRef, LedgerMonth } from "../types";

// =============================================================================
// Facts engine (Layer 2) — pure deterministic functions over a Ledger. Each
// returns a Fact { value, formulaId, evidence, asOf }. NO AI, NO I/O. These are
// the ONLY source of the numbers the UI shows; generators read facts, the
// narrator writes words around them. Every fact carries human-readable evidence
// for the "show me why" drill-down.
//
// Month convention: ledger.months is chronological (oldest→newest). The current
// (partial) month is the last entry; prior COMPLETE months are the rest.
// =============================================================================

const round = (n: number) => +n.toFixed(2);
const asOf = (l: Ledger) => l.asOf;

function currentAndPrior(l: Ledger): { current: LedgerMonth | null; prior: LedgerMonth[] } {
  if (l.months.length === 0) return { current: null, prior: [] };
  return { current: l.months[l.months.length - 1], prior: l.months.slice(0, -1) };
}

// Fraction of a month's spending typically completed by `dayOfMonth`, learned
// from the user's OWN prior months if we can, else a linear default. Used to
// project month-to-date spending to a full-month estimate for pace.
export function intraMonthFraction(dayOfMonth: number, daysInMonth: number): number {
  // Seasonality-naive v1: linear. (A per-user curve is a stage-3 refinement.)
  return Math.min(1, Math.max(0.001, dayOfMonth / daysInMonth));
}

function daysInMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// ── pace: month-to-date spend for a category vs projection vs 3-mo baseline ──
export interface PaceValue {
  category: string;
  mtd: number;            // spent so far this month
  projected: number;      // projected full-month at current pace
  baseline: number;       // trailing 3-month average for this category
  overPct: number;        // projected vs baseline, signed %
}

export function pace(l: Ledger, category: string, now: number = Date.parse(l.asOf)): Fact<PaceValue> {
  const { current, prior } = currentAndPrior(l);
  const d = new Date(now);
  const dim = daysInMonthUTC(d.getUTCFullYear(), d.getUTCMonth());
  const dom = d.getUTCDate();
  const frac = intraMonthFraction(dom, dim);

  const mtd = current?.byCategory[category] ?? 0;
  const projected = frac > 0 ? mtd / frac : mtd;
  const last3 = prior.slice(-3).map((m) => m.byCategory[category] ?? 0);
  const baseline = last3.length ? last3.reduce((s, v) => s + v, 0) / last3.length : 0;
  const overPct = baseline > 0 ? ((projected - baseline) / baseline) * 100 : (projected > 0 ? 100 : 0);

  const evidence: EvidenceRef = {
    kind: "inputs",
    inputs: { category, monthToDate: round(mtd), dayOfMonth: dom, daysInMonth: dim, baseline3mo: round(baseline) },
    note: `Based on ${round(mtd)} spent on ${category} through day ${dom} of ${dim}, vs a 3-month average of ${round(baseline)}.`,
  };
  return { value: { category, mtd: round(mtd), projected: round(projected), baseline: round(baseline), overPct: +overPct.toFixed(1) }, formulaId: "pace.v1", evidence, asOf: asOf(l) };
}

// ── categoryTrend: direction + magnitude of a category vs baseline ──
export interface TrendValue { category: string; latest: number; baseline: number; deltaPct: number; direction: "up" | "down" | "flat" }
export function categoryTrend(l: Ledger, category: string, months = 3): Fact<TrendValue> {
  const complete = l.months.slice(0, -1); // exclude partial current month
  const latest = complete.at(-1)?.byCategory[category] ?? 0;
  const base = complete.slice(-(months + 1), -1).map((m) => m.byCategory[category] ?? 0);
  const baseline = base.length ? base.reduce((s, v) => s + v, 0) / base.length : 0;
  const deltaPct = baseline > 0 ? ((latest - baseline) / baseline) * 100 : (latest > 0 ? 100 : 0);
  const direction = Math.abs(deltaPct) < 5 ? "flat" : deltaPct > 0 ? "up" : "down";
  return {
    value: { category, latest: round(latest), baseline: round(baseline), deltaPct: +deltaPct.toFixed(1), direction },
    formulaId: "categoryTrend.v1",
    evidence: { kind: "inputs", inputs: { category, latest: round(latest), baseline: round(baseline) }, note: `${category}: latest complete month ${round(latest)} vs ${months}-month average ${round(baseline)}.` },
    asOf: asOf(l),
  };
}

// ── cashBuffer + idleCash ──
export interface BufferValue { liquid: number; monthlyOutflow: number; monthsRunway: number }
function monthlyOutflow(l: Ledger): number {
  const complete = l.months.slice(0, -1).slice(-3);
  if (!complete.length) return 0;
  return complete.reduce((s, m) => s + m.fixed + m.discretionary, 0) / complete.length;
}
export function cashBuffer(l: Ledger): Fact<BufferValue> {
  const liquid = l.balances.filter((b) => b.isLiquid).reduce((s, b) => s + b.current, 0);
  const outflow = monthlyOutflow(l);
  const runway = outflow > 0 ? liquid / outflow : Infinity;
  return {
    value: { liquid: round(liquid), monthlyOutflow: round(outflow), monthsRunway: Number.isFinite(runway) ? +runway.toFixed(1) : 0 },
    formulaId: "cashBuffer.v1",
    evidence: { kind: "inputs", inputs: { liquid: round(liquid), monthlyOutflow: round(outflow) }, note: `Liquid cash ${round(liquid)} against a 3-month average outflow of ${round(outflow)}/mo.` },
    asOf: asOf(l),
  };
}
export interface IdleValue { liquid: number; targetBuffer: number; idle: number }
export function idleCash(l: Ledger, bufferMultiple = 1.5): Fact<IdleValue> {
  const liquid = l.balances.filter((b) => b.isLiquid).reduce((s, b) => s + b.current, 0);
  const target = monthlyOutflow(l) * bufferMultiple;
  const idle = Math.max(0, liquid - target);
  return {
    value: { liquid: round(liquid), targetBuffer: round(target), idle: round(idle) },
    formulaId: "idleCash.v1",
    evidence: { kind: "inputs", inputs: { liquid: round(liquid), targetBuffer: round(target) }, note: `Liquid ${round(liquid)} beyond a ${bufferMultiple}× monthly-outflow buffer of ${round(target)}.` },
    asOf: asOf(l),
  };
}

// ── interestBleed: projected annual interest at current balance/APR ──
export interface BleedValue { totalBalance: number; weightedApr: number; projectedAnnual: number; byCard: { name: string; balance: number; apr: number; annual: number }[] }
export function interestBleed(l: Ledger): Fact<BleedValue> {
  const withApr = l.cards.filter((c) => c.apr != null && c.balance > 0);
  const byCard = withApr.map((c) => ({ name: c.name, balance: round(c.balance), apr: c.apr!, annual: round(c.balance * (c.apr! / 100)) }));
  const totalBalance = round(withApr.reduce((s, c) => s + c.balance, 0));
  const projectedAnnual = round(byCard.reduce((s, c) => s + c.annual, 0));
  const weightedApr = totalBalance > 0 ? +(byCard.reduce((s, c) => s + c.apr * c.balance, 0) / totalBalance).toFixed(2) : 0;
  return {
    value: { totalBalance, weightedApr, projectedAnnual, byCard },
    formulaId: "interestBleed.v1",
    evidence: { kind: "inputs", inputs: { totalBalance, weightedApr }, note: `${byCard.length} card(s) carrying ${totalBalance} at a weighted ${weightedApr}% APR.` },
    asOf: asOf(l),
  };
}

// ── debtVsCashArbitrage: idle cash vs highest-APR balance ──
export interface ArbValue { idle: number; topApr: number; topCard: string | null; payable: number; guaranteedAnnual: number }
export function debtVsCashArbitrage(l: Ledger, bufferMultiple = 1.5): Fact<ArbValue> {
  const idle = idleCash(l, bufferMultiple).value.idle;
  const cards = l.cards.filter((c) => c.apr != null && c.balance > 0).sort((a, b) => b.apr! - a.apr!);
  const top = cards[0] ?? null;
  const topApr = top?.apr ?? 0;
  const payable = top ? Math.min(idle, top.balance) : 0;
  const guaranteedAnnual = round(payable * (topApr / 100));
  return {
    value: { idle: round(idle), topApr, topCard: top?.name ?? null, payable: round(payable), guaranteedAnnual },
    formulaId: "debtVsCashArbitrage.v1",
    evidence: { kind: "inputs", inputs: { idle: round(idle), topApr, payable: round(payable) }, note: `${round(idle)} idle cash vs a ${topApr}% balance — paying ${round(payable)} saves ${guaranteedAnnual}/yr guaranteed.` },
    asOf: asOf(l),
  };
}

// ── savingsCapacity: trailing income − fixed − p50 discretionary ──
export interface CapacityValue { avgIncome: number; avgFixed: number; medianDiscretionary: number; capacity: number }
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
export function savingsCapacity(l: Ledger): Fact<CapacityValue> {
  const complete = l.months.slice(0, -1).slice(-6);
  const avgIncome = complete.length ? complete.reduce((s, m) => s + m.income, 0) / complete.length : 0;
  const avgFixed = complete.length ? complete.reduce((s, m) => s + m.fixed, 0) / complete.length : 0;
  const medianDiscretionary = median(complete.map((m) => m.discretionary));
  const capacity = Math.max(0, avgIncome - avgFixed - medianDiscretionary);
  return {
    value: { avgIncome: round(avgIncome), avgFixed: round(avgFixed), medianDiscretionary: round(medianDiscretionary), capacity: round(capacity) },
    formulaId: "savingsCapacity.v1",
    evidence: { kind: "inputs", inputs: { avgIncome: round(avgIncome), avgFixed: round(avgFixed), medianDiscretionary: round(medianDiscretionary) }, note: `Avg income ${round(avgIncome)} − fixed ${round(avgFixed)} − typical discretionary ${round(medianDiscretionary)}.` },
    asOf: asOf(l),
  };
}

// ── netWorthTrajectory: 6-mo slope from snapshots ($/month) ──
export interface TrajectoryValue { start: number; end: number; monthlySlope: number; months: number }
export function netWorthTrajectory(l: Ledger): Fact<TrajectoryValue> {
  const pts = l.netWorthHistory.slice(-7); // ~6 intervals
  if (pts.length < 2) {
    return { value: { start: 0, end: 0, monthlySlope: 0, months: 0 }, formulaId: "netWorthTrajectory.v1", evidence: { kind: "inputs", inputs: {}, note: "Not enough net-worth history yet." }, asOf: asOf(l) };
  }
  const start = pts[0].net, end = pts.at(-1)!.net;
  const spanMs = Date.parse(pts.at(-1)!.date) - Date.parse(pts[0].date);
  const months = Math.max(1, spanMs / (30 * 86_400_000));
  const monthlySlope = (end - start) / months;
  return {
    value: { start: round(start), end: round(end), monthlySlope: round(monthlySlope), months: +months.toFixed(1) },
    formulaId: "netWorthTrajectory.v1",
    evidence: { kind: "inputs", inputs: { start: round(start), end: round(end) }, note: `Net worth moved from ${round(start)} to ${round(end)} over ~${months.toFixed(1)} months.` },
    asOf: asOf(l),
  };
}
