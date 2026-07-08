import type { Ledger, StructuredInsight } from "../types";
import {
  pace, interestBleed, debtVsCashArbitrage, categoryTrend, netWorthTrajectory, savingsCapacity, cashBuffer,
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
      severity: v.overPct >= 60 ? 2 : 1,
      headlineSlots: { category: cat, projected: v.projected, baseline: v.baseline, overPct: Math.round(v.overPct), extra },
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

// 2) Debt-vs-cash arbitrage — idle cash sitting while a high-APR balance accrues.
export function detectArbitrage(l: Ledger): StructuredInsight[] {
  const f = debtVsCashArbitrage(l);
  const v = f.value;
  if (!v.topCard || v.payable < 250 || v.topApr < 8 || v.guaranteedAnnual < 50) return [];
  return [{
    kind: "debt_vs_cash",
    subject: v.topCard,
    severity: 2,
    headlineSlots: { card: v.topCard, apr: v.topApr, payable: v.payable, guaranteedAnnual: v.guaranteedAnnual, idle: v.idle },
    impactPerYear: v.guaranteedAnnual,
    evidence: [f.evidence],
    factsUsed: [f.formulaId],
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

// Run all stage-2 generators over a ledger.
export function generateInsights(l: Ledger): StructuredInsight[] {
  return [
    ...detectPaceAnomaly(l),
    ...detectArbitrage(l),
    ...detectInterestBleed(l),
    ...detectPositive(l),
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
