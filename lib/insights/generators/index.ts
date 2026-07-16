import type { Ledger, StructuredInsight } from "../types";
import {
  pace, interestBleed, debtVsCashArbitrage, categoryTrend, netWorthTrajectory, savingsCapacity, cashBuffer,
  idleCash, utilization,
} from "../facts";

// =============================================================================
// Insight generators (Layer 3). Each detect() reads FACTS and returns a
// StructuredInsight or null. EVERY number lives in headlineSlots — the narrator
// only writes the connective words. Generators never call the LLM and never
// touch I/O, so they are golden-testable (fixture → exact slots/impact).
//
// This pass ships 4 (spec rollout stage 2): spending-pace anomaly, debt-vs-cash
// arbitrage, interest bleed, and positive reinforcement (required — the
// confidant celebrates, not only warns). The remaining 6 are stage 3.
// =============================================================================

// Discretionary categories worth pacing (obligations don't "pace").
const PACEABLE = ["Food & Dining", "Shopping", "Entertainment", "Travel", "Groceries", "Transportation"];

// 1) Spending-pace anomaly — a discretionary category projected well above its
//    own 3-month baseline. Warm, not scolding ("worth a look").
export function detectPaceAnomaly(l: Ledger): StructuredInsight[] {
  const out: StructuredInsight[] = [];
  for (const cat of PACEABLE) {
    const f = pace(l, cat);
    const v = f.value;
    // Non-trivial: projected >= $120, at least 25% over baseline, baseline exists.
    if (v.baseline <= 0 || v.projected < 120 || v.overPct < 25) continue;
    const extra = +(v.projected - v.baseline).toFixed(2);
    out.push({
      kind: "pace_anomaly",
      subject: cat,
      // Limited history (1–2 baseline months) is noisier — cap at severity 1 and
      // carry a limitedHistory slot so the UI/narrator can add "based on limited
      // history" instead of the insight staying silent until 3 months exist.
      severity: v.limited ? 1 : (v.overPct >= 60 ? 2 : 1),
      headlineSlots: { category: cat, projected: v.projected, baseline: v.baseline, baselineMonths: v.baselineMonths, overPct: Math.round(v.overPct), extra, ...(v.limited ? { limitedHistory: 1 } : {}) },
      impactPerYear: +(extra * 12).toFixed(2),
      evidence: [f.evidence],
      factsUsed: [f.formulaId],
      action: { label: `See ${cat} spending`, deeplink: "/spending" },
      cooldownDays: 14,
      page: "spending",
    });
  }
  // Rank the biggest overspend first; cap so one month can't flood.
  return out.sort((a, b) => (b.impactPerYear ?? 0) - (a.impactPerYear ?? 0)).slice(0, 2);
}

// A dated live rate the caller (nightly run) may pass to ground the "money left
// on the table" generators. Optional — absent → the previous generic framing.
export interface LiveRate { ratePct: number; asOf: string | null }

// 2) Debt-vs-cash arbitrage — idle cash sitting while a high-APR balance accrues.
export function detectArbitrage(l: Ledger, rate?: LiveRate | null): StructuredInsight[] {
  const f = debtVsCashArbitrage(l);
  const v = f.value;
  if (!v.topCard || v.payable < 250 || v.topApr < 8 || v.guaranteedAnnual < 50) return [];
  // MV4: when we have a live cash rate, cite the SPREAD (card APR − cash rate) —
  // the real cost of not paying down while cash earns only the cash rate.
  const spreadSlots: Record<string, number | string> = rate ? { cashRatePct: +rate.ratePct.toFixed(2), spreadPct: +(v.topApr - rate.ratePct).toFixed(2), rateAsOf: rate.asOf ?? "" } : {};
  return [{
    kind: "debt_vs_cash",
    subject: v.topCard,
    severity: 2,
    headlineSlots: { card: v.topCard, apr: v.topApr, payable: v.payable, guaranteedAnnual: v.guaranteedAnnual, idle: v.idle, ...spreadSlots },
    impactPerYear: v.guaranteedAnnual,
    evidence: [f.evidence, ...(rate ? [{ kind: "inputs" as const, inputs: { cashRatePct: rate.ratePct, cardApr: v.topApr, asOf: rate.asOf ?? "n/a" }, note: `Cash earns ~${rate.ratePct}% (as of ${rate.asOf ?? "recent"}); the card charges ${v.topApr}%.` }] : [])],
    factsUsed: [f.formulaId, ...(rate ? ["rates.v1"] : [])],
    action: { label: "Review accounts", deeplink: "/accounts" },
    cooldownDays: 21,
    page: "accounts",
  }];
}

// 3) Interest bleed — actual/projected annual card interest.
export function detectInterestBleed(l: Ledger): StructuredInsight[] {
  const f = interestBleed(l);
  const v = f.value;
  if (v.projectedAnnual < 100 || v.totalBalance <= 0) return [];
  return [{
    kind: "interest_bleed",
    subject: "cards",
    severity: v.projectedAnnual >= 600 ? 3 : 2,
    headlineSlots: { projectedAnnual: v.projectedAnnual, totalBalance: v.totalBalance, weightedApr: v.weightedApr, cardCount: v.byCard.length },
    impactPerYear: v.projectedAnnual,
    evidence: [f.evidence],
    factsUsed: [f.formulaId],
    action: { label: "See card balances", deeplink: "/accounts" },
    cooldownDays: 21,
    page: "accounts",
  }];
}

// 4) Positive reinforcement (REQUIRED) — the confidant celebrates. Fires on the
//    strongest true positive: a discretionary category trending DOWN, a net-worth
//    milestone, or real savings capacity. One positive is better than none.
export function detectPositive(l: Ledger): StructuredInsight[] {
  const candidates: StructuredInsight[] = [];

  // a) A discretionary category meaningfully DOWN vs its baseline.
  for (const cat of PACEABLE) {
    const t = categoryTrend(l, cat).value;
    if (t.direction === "down" && t.baseline > 0 && Math.abs(t.deltaPct) >= 20 && (t.baseline - t.latest) >= 60) {
      const saved = +(t.baseline - t.latest).toFixed(2);
      candidates.push({
        kind: "positive_spend_down",
        subject: cat,
        severity: 1,
        headlineSlots: { category: cat, latest: t.latest, baseline: t.baseline, downPct: Math.abs(Math.round(t.deltaPct)), saved },
        impactPerYear: +(saved * 12).toFixed(2),
        evidence: [categoryTrend(l, cat).evidence],
        factsUsed: ["categoryTrend.v1"],
        cooldownDays: 21,
        positive: true,
        page: "spending",
      });
    }
  }

  // b) Net worth climbing.
  const nw = netWorthTrajectory(l).value;
  if (nw.months >= 2 && nw.monthlySlope > 0 && nw.end > nw.start) {
    candidates.push({
      kind: "positive_networth",
      subject: "networth",
      severity: 1,
      headlineSlots: { start: nw.start, end: nw.end, monthlySlope: nw.monthlySlope, months: nw.months },
      impactPerYear: +(nw.monthlySlope * 12).toFixed(2),
      evidence: [netWorthTrajectory(l).evidence],
      factsUsed: ["netWorthTrajectory.v1"],
      cooldownDays: 30,
      positive: true,
      page: "networth",
    });
  }

  // Strongest single positive (biggest annualized impact).
  return candidates.sort((a, b) => (b.impactPerYear ?? 0) - (a.impactPerYear ?? 0)).slice(0, 1);
}

// 5) Idle cash / cash drag — meaningful liquid cash beyond the buffer, framed
//    as OPTION math (educational). Never directive; no return promises.
export function detectIdleCash(l: Ledger, rate?: LiveRate | null): StructuredInsight[] {
  const f = idleCash(l);
  const v = f.value;
  // Non-trivial: at least $2,000 idle beyond the buffer.
  if (v.idle < 2000) return [];
  // MV4: with a live rate, quantify the annual cost of idle cash at ~0% vs the
  // available yield — impactPerYear becomes real (was null under the no-return
  // assumption). Rate always carries its asOf.
  const annualIfMoved = rate ? +(v.idle * (rate.ratePct / 100)).toFixed(2) : null;
  const rateSlots: Record<string, number | string> = rate ? { ratePct: +rate.ratePct.toFixed(2), annualIfMoved: annualIfMoved!, rateAsOf: rate.asOf ?? "" } : {};
  return [{
    kind: "idle_cash",
    subject: "cash",
    severity: 1,
    headlineSlots: { idle: v.idle, targetBuffer: v.targetBuffer, liquid: v.liquid, ...rateSlots },
    impactPerYear: annualIfMoved, // real $/yr when a rate is available; else null (option framing)
    evidence: [f.evidence, ...(rate ? [{ kind: "inputs" as const, inputs: { idle: v.idle, ratePct: rate.ratePct, annualIfMoved: annualIfMoved!, asOf: rate.asOf ?? "n/a" }, note: `${v.idle} idle at ~0% vs ${rate.ratePct}% available (as of ${rate.asOf ?? "recent"}) = ${annualIfMoved}/yr.` }] : [])],
    factsUsed: [f.formulaId, ...(rate ? ["rates.v1"] : [])],
    action: { label: "See accounts", deeplink: "/accounts" },
    cooldownDays: 30,
    page: "accounts",
  }];
}

// 6) Utilization creep — credit utilization crossing the 30% / 50% steps.
export function detectUtilization(l: Ledger): StructuredInsight[] {
  const f = utilization(l);
  const v = f.value;
  if (v.totalLimit <= 0 || v.totalUtil < 30) return [];
  // Step severity: >50% is a stronger nudge than >30%.
  const severity: 1 | 2 | 3 = v.totalUtil >= 50 ? 2 : 1;
  return [{
    kind: "utilization",
    subject: "cards",
    severity,
    headlineSlots: { totalUtil: Math.round(v.totalUtil), totalBalance: v.totalBalance, totalLimit: v.totalLimit, worstCard: v.worst?.name ?? "", worstUtil: v.worst ? Math.round(v.worst.util) : 0 },
    impactPerYear: null,
    evidence: [f.evidence],
    factsUsed: [f.formulaId],
    action: { label: "See card balances", deeplink: "/accounts" },
    cooldownDays: 21,
    page: "accounts",
  }];
}

// 7) Low-buffer warning — under 1 month of runway. Severity 3 but the GENTLEST
//    register + one small next step (the narrator template carries the tone).
export function detectLowBuffer(l: Ledger): StructuredInsight[] {
  const f = cashBuffer(l);
  const v = f.value;
  // Only when we actually have outflow to compare against and runway is short.
  if (v.monthlyOutflow <= 0 || v.monthsRunway <= 0 || v.monthsRunway >= 1) return [];
  return [{
    kind: "low_buffer",
    subject: "buffer",
    severity: 3,
    headlineSlots: { monthsRunway: v.monthsRunway, liquid: v.liquid, monthlyOutflow: v.monthlyOutflow },
    impactPerYear: null,
    evidence: [f.evidence],
    factsUsed: [f.formulaId],
    action: { label: "Review money", deeplink: "/money" },
    cooldownDays: 14,
    page: "accounts",
  }];
}

// 8) Savings-capacity opportunity — recurring surplus that could be automated.
export function detectSavingsCapacity(l: Ledger): StructuredInsight[] {
  const f = savingsCapacity(l);
  const v = f.value;
  if (v.capacity < 150) return [];
  return [{
    kind: "savings_capacity",
    subject: "savings",
    severity: 1,
    headlineSlots: { capacity: v.capacity, avgIncome: v.avgIncome, avgFixed: v.avgFixed, medianDiscretionary: v.medianDiscretionary },
    impactPerYear: +(v.capacity * 12).toFixed(2),
    evidence: [f.evidence],
    factsUsed: [f.formulaId],
    action: { label: "See money dashboard", deeplink: "/money" },
    cooldownDays: 30,
    positive: true,
    page: "spending",
  }];
}

// 9) Category-trend shift — a discretionary category up materially vs baseline
//    over completed months (distinct from pace, which is mid-month projection).
export function detectCategoryTrend(l: Ledger): StructuredInsight[] {
  const out: StructuredInsight[] = [];
  for (const cat of PACEABLE) {
    const t = categoryTrend(l, cat).value;
    if (t.direction !== "up" || t.baseline <= 0 || Math.abs(t.deltaPct) < 30 || (t.latest - t.baseline) < 80) continue;
    const delta = +(t.latest - t.baseline).toFixed(2);
    out.push({
      kind: "category_trend",
      subject: cat,
      severity: 1,
      headlineSlots: { category: cat, latest: t.latest, baseline: t.baseline, upPct: Math.round(t.deltaPct), delta },
      impactPerYear: +(delta * 12).toFixed(2),
      evidence: [categoryTrend(l, cat).evidence],
      factsUsed: ["categoryTrend.v1"],
      action: { label: `See ${cat} spending`, deeplink: "/spending" },
      cooldownDays: 21,
      page: "spending",
    });
  }
  return out.sort((a, b) => (b.impactPerYear ?? 0) - (a.impactPerYear ?? 0)).slice(0, 1);
}

// Run all generators over a ledger. (Concentration + new-recurring insights are
// added by the nightly job, which has holdings + recurring data.)
export function generateInsights(l: Ledger, rate?: LiveRate | null): StructuredInsight[] {
  return [
    ...detectPaceAnomaly(l),
    ...detectArbitrage(l, rate),
    ...detectInterestBleed(l),
    ...detectPositive(l),
    ...detectIdleCash(l, rate),
    ...detectUtilization(l),
    ...detectLowBuffer(l),
    ...detectSavingsCapacity(l),
    ...detectCategoryTrend(l),
  ];
}

// ── Dedupe against prior insights: same (kind, subject) within cooldown is
// suppressed unless severity escalated on material change. Pure. ──
export interface PriorInsight { kind: string; subject: string; severity: number; createdAt: string; status: string }
export function dedupe(fresh: StructuredInsight[], prior: PriorInsight[], now: number = Date.now()): StructuredInsight[] {
  const priorByKey = new Map<string, PriorInsight>();
  for (const p of prior) priorByKey.set(`${p.kind}::${p.subject}`, p);

  return fresh.filter((f) => {
    const p = priorByKey.get(`${f.kind}::${f.subject}`);
    if (!p) return true;
    // A muted/dismissed insight of the same key stays suppressed for its cooldown.
    const ageDays = (now - Date.parse(p.createdAt)) / 86_400_000;
    if (p.status === "muted") return false;
    if (ageDays < f.cooldownDays) {
      // Within cooldown: only resurface if severity escalated (material change).
      return f.severity > p.severity;
    }
    return true; // cooldown elapsed → allowed again
  });
}
