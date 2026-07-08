import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/insights/ledger/build";
import { detectPaceAnomaly, detectArbitrage, detectInterestBleed, detectPositive, dedupe } from "@/lib/insights/generators";
import type { LedgerInputs, LedgerTxn } from "@/lib/insights/types";

function txn(p: Partial<LedgerTxn> & { transactionId: string; amount: number; date: string; merchant: string }): LedgerTxn {
  return { accountId: "chk", name: p.merchant, plaidCategory: null, plaidDetailed: null, pending: false, removed: false, ...p } as LedgerTxn;
}

function baseInputs(): LedgerInputs {
  const txns: LedgerTxn[] = [];
  for (const m of ["2026-01-15", "2026-02-15", "2026-03-15"]) txns.push(txn({ transactionId: `dine-${m}`, amount: 200, date: m, merchant: "Chipotle" }));
  txns.push(txn({ transactionId: "dine-apr", amount: 150, date: "2026-04-10", merchant: "Chipotle" }));
  return {
    txns, overrides: [],
    balances: [{ accountId: "chk", name: "Checking", type: "depository", subtype: "checking", current: 8000, available: 8000, isLiquid: true }],
    cards: [{ accountId: "cc1", name: "Visa", balance: 4000, limit: 10000, apr: 24 }],
    netWorthHistory: [{ date: "2026-01-01", net: 20000 }, { date: "2026-04-01", net: 26000 }],
  };
}

const NOW = Date.UTC(2026, 3, 10);

describe("detectPaceAnomaly (golden)", () => {
  it("fires on dining projected 450 vs 200 baseline with exact slots", () => {
    const l = buildLedger(baseInputs(), NOW);
    const out = detectPaceAnomaly(l);
    const dining = out.find((i) => i.subject === "Food & Dining");
    expect(dining).toBeTruthy();
    expect(dining!.kind).toBe("pace_anomaly");
    expect(dining!.headlineSlots.baseline).toBe(200);
    expect(Number(dining!.headlineSlots.projected)).toBeCloseTo(450, 0);
    // extra ~250/mo → impact ~3000/yr.
    expect(dining!.impactPerYear).toBeCloseTo(3000, -2);
    // EVERY number lives in slots — no digits in kind/subject.
    expect(/[0-9]/.test(dining!.kind)).toBe(false);
  });
});

describe("detectInterestBleed + detectArbitrage (golden)", () => {
  it("interest bleed slots the projected annual", () => {
    const l = buildLedger(baseInputs(), NOW);
    const out = detectInterestBleed(l);
    expect(out).toHaveLength(1);
    expect(out[0].headlineSlots.projectedAnnual).toBeCloseTo(960, 0);
    expect(out[0].impactPerYear).toBeCloseTo(960, 0);
  });
  it("arbitrage slots guaranteed annual from idle cash", () => {
    const l = buildLedger(baseInputs(), NOW);
    const out = detectArbitrage(l);
    expect(out).toHaveLength(1);
    expect(out[0].headlineSlots.card).toBe("Visa");
    expect(out[0].headlineSlots.guaranteedAnnual).toBeCloseTo(960, 0);
  });
});

describe("detectPositive (required — celebrates)", () => {
  it("fires a positive net-worth insight when the trajectory is up", () => {
    const l = buildLedger(baseInputs(), NOW);
    const out = detectPositive(l);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].positive).toBe(true);
  });
});

describe("dedupe", () => {
  it("suppresses a same-kind/subject insight within cooldown unless severity escalates", () => {
    const l = buildLedger(baseInputs(), NOW);
    const fresh = detectInterestBleed(l); // severity 3 here (>=600)
    const prior = [{ kind: "interest_bleed", subject: "cards", severity: 3, createdAt: new Date(NOW - 2 * 86_400_000).toISOString(), status: "seen" }];
    // Within cooldown, same severity → suppressed.
    expect(dedupe(fresh, prior, NOW)).toHaveLength(0);
    // Muted prior → always suppressed.
    const muted = [{ ...prior[0], status: "muted" }];
    expect(dedupe(fresh, muted, NOW)).toHaveLength(0);
    // Cooldown elapsed → allowed again.
    const old = [{ ...prior[0], createdAt: new Date(NOW - 60 * 86_400_000).toISOString() }];
    expect(dedupe(fresh, old, NOW)).toHaveLength(1);
  });
});
