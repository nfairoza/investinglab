import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/insights/ledger/build";
import { pace, cashBuffer, idleCash, interestBleed, debtVsCashArbitrage, intraMonthFraction } from "@/lib/insights/facts";
import type { LedgerInputs, LedgerTxn } from "@/lib/insights/types";

function txn(p: Partial<LedgerTxn> & { transactionId: string; amount: number; date: string; merchant: string }): LedgerTxn {
  return { accountId: "chk", name: p.merchant, plaidCategory: null, plaidDetailed: null, pending: false, removed: false, ...p } as LedgerTxn;
}

// Build a ledger with 3 prior full months of $200/mo dining + a partial current
// month, plus liquid cash and a credit card, for deterministic fact assertions.
function fixtureInputs(): LedgerInputs {
  const txns: LedgerTxn[] = [];
  // Dining $200 across each prior month (one charge/mo).
  for (const m of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
    txns.push(txn({ transactionId: `dine-${m}`, amount: 200, date: m, merchant: "Chipotle" }));
  }
  // Current month (April) partial: $150 dining by day 10.
  txns.push(txn({ transactionId: "dine-apr", amount: 150, date: "2026-04-10", merchant: "Chipotle" }));
  return {
    txns,
    overrides: [],
    balances: [
      { accountId: "chk", name: "Checking", type: "depository", subtype: "checking", current: 8000, available: 8000, isLiquid: true },
    ],
    cards: [
      { accountId: "cc1", name: "Visa", balance: 4000, limit: 10000, apr: 24 },
      { accountId: "cc2", name: "Store card", balance: 1000, limit: 2000, apr: 12 },
    ],
    netWorthHistory: [
      { date: "2026-01-01", net: 20000 },
      { date: "2026-04-01", net: 26000 },
    ],
  };
}

describe("intraMonthFraction", () => {
  it("is linear and clamped", () => {
    expect(intraMonthFraction(15, 30)).toBeCloseTo(0.5, 5);
    expect(intraMonthFraction(0, 30)).toBeGreaterThan(0);   // never 0 (no divide blowup)
    expect(intraMonthFraction(40, 30)).toBe(1);             // clamped to 1
  });
});

describe("pace", () => {
  it("projects month-to-date to full month and compares to 3-mo baseline", () => {
    const l = buildLedger(fixtureInputs(), Date.UTC(2026, 3, 10)); // April 10
    const f = pace(l, "Food & Dining", Date.UTC(2026, 3, 10));
    // MTD 150 through day 10 of 30 → frac 1/3 → projected ~450. Baseline 200.
    expect(f.value.mtd).toBe(150);
    expect(f.value.projected).toBeCloseTo(450, 0);
    expect(f.value.baseline).toBe(200);
    expect(f.value.overPct).toBeGreaterThan(100);
    expect(f.formulaId).toBe("pace.v1");
    expect(f.evidence.note).toMatch(/day 10 of 30/);
  });
});

describe("cashBuffer / idleCash", () => {
  it("computes runway and idle cash beyond the buffer", () => {
    const l = buildLedger(fixtureInputs(), Date.UTC(2026, 3, 10));
    const buf = cashBuffer(l).value;
    // Monthly outflow = avg of last-3 complete months' (fixed+discretionary).
    // Only dining $200/mo discretionary → outflow 200. Liquid 8000 → 40mo runway.
    expect(buf.liquid).toBe(8000);
    expect(buf.monthlyOutflow).toBe(200);
    expect(buf.monthsRunway).toBeCloseTo(40, 0);
    const idle = idleCash(l, 1.5).value;
    // Target = 200 * 1.5 = 300 → idle = 7700.
    expect(idle.targetBuffer).toBe(300);
    expect(idle.idle).toBe(7700);
  });
});

describe("interestBleed", () => {
  it("projects annual interest per card and weighted APR", () => {
    const l = buildLedger(fixtureInputs(), Date.UTC(2026, 3, 10));
    const v = interestBleed(l).value;
    // 4000@24% = 960/yr; 1000@12% = 120/yr → 1080 total. Weighted APR ~21.6.
    expect(v.projectedAnnual).toBeCloseTo(1080, 0);
    expect(v.totalBalance).toBe(5000);
    expect(v.weightedApr).toBeCloseTo(21.6, 1);
  });
});

describe("debtVsCashArbitrage", () => {
  it("pays down the highest-APR card from idle cash and returns guaranteed $/yr", () => {
    const l = buildLedger(fixtureInputs(), Date.UTC(2026, 3, 10));
    const v = debtVsCashArbitrage(l, 1.5).value;
    // Idle 7700 vs top card 4000@24% → payable 4000, saves 960/yr.
    expect(v.topCard).toBe("Visa");
    expect(v.topApr).toBe(24);
    expect(v.payable).toBe(4000);
    expect(v.guaranteedAnnual).toBeCloseTo(960, 0);
  });
});
