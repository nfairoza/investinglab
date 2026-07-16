import type { Ledger, StructuredInsight } from "../types";

// Flow-shift generator — fires when a spending category's SHARE OF INCOME shifts
// materially this month vs the trailing 3-month mix ("Food & Dining took 13% of
// income this month vs your usual 9%"). Pairs with the cash-flow Sankey. Pure
// over the ledger; numbers in slots only.

const SHIFT_PCT_POINTS = 3;   // category share must move ≥ this many points of income
const MIN_INCOME = 500;       // ignore months with negligible income (noisy shares)

export function detectFlowShift(l: Ledger, now = new Date()): StructuredInsight[] {
  const curMonth = now.toISOString().slice(0, 7);
  const cur = l.months.find((m) => m.month === curMonth);
  if (!cur || cur.income < MIN_INCOME) return [];

  // Trailing 3 completed months before the current one.
  const prior = l.months.filter((m) => m.month < curMonth).slice(-3).filter((m) => m.income >= MIN_INCOME);
  // Baseline honesty (Q7): fire even with only 1–2 prior months, but flag it as
  // "based on limited history" so the caveat rides along instead of the insight
  // staying silent until 3 full months exist. Zero prior months = truly nothing
  // to compare against, so we still return nothing.
  if (prior.length < 1) return [];
  const limitedHistory = prior.length < 3;
  const baselineWindow = prior.length; // how many months the baseline averages over

  // Baseline share per category = avg(category spend / income) over prior months.
  const baselineShare = new Map<string, number>();
  const cats = new Set<string>();
  for (const m of prior) for (const c of Object.keys(m.byCategory)) cats.add(c);
  for (const c of cats) {
    const shares = prior.map((m) => (m.byCategory[c] ?? 0) / m.income);
    baselineShare.set(c, shares.reduce((s, v) => s + v, 0) / shares.length);
  }

  const out: StructuredInsight[] = [];
  for (const c of Object.keys(cur.byCategory)) {
    const thisShare = (cur.byCategory[c] ?? 0) / cur.income;
    const usual = baselineShare.get(c) ?? 0;
    const deltaPts = (thisShare - usual) * 100;
    if (Math.abs(deltaPts) < SHIFT_PCT_POINTS) continue;
    const thisPct = Math.round(thisShare * 100);
    const usualPct = Math.round(usual * 100);
    if (thisPct === usualPct) continue;
    const windowNote = `Baseline is the average over the prior ${baselineWindow} month${baselineWindow === 1 ? "" : "s"}${limitedHistory ? " (limited history so far)" : ""}.`;
    out.push({
      kind: "flow_shift",
      subject: c,
      // Limited-history shifts are noisier, so cap severity at 1 until we have a
      // stable 3-month baseline (avoids over-alarming on a single prior month).
      severity: limitedHistory ? 1 : (Math.abs(deltaPts) >= 6 ? 2 : 1),
      positive: deltaPts < 0, // taking a SMALLER slice of income is good
      headlineSlots: { category: c, thisPct, usualPct, ...(limitedHistory ? { limitedHistory: 1 } : {}) },
      impactPerYear: null,
      evidence: [{ kind: "inputs", inputs: { category: c, thisMonthShare: thisPct, baselineShare: usualPct, income: Math.round(cur.income), baselineMonths: baselineWindow }, note: `${c} was ${thisPct}% of income this month vs a usual ${usualPct}%. ${windowNote}` }],
      factsUsed: ["flowShift.v1"],
      action: { label: "See the cash-flow", deeplink: "/spending" },
      cooldownDays: 21,
      page: "spending",
    });
  }
  // Biggest shift first; cap so one month doesn't flood.
  return out.sort((a, b) => Math.abs(Number(b.headlineSlots.thisPct) - Number(b.headlineSlots.usualPct)) - Math.abs(Number(a.headlineSlots.thisPct) - Number(a.headlineSlots.usualPct))).slice(0, 2);
}
