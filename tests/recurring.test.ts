import { describe, it, expect } from "vitest";
import { detectRecurring, monthlyTotal, type RecurringTxn } from "@/lib/recurring/detect";

// F6 acceptance: a seeded thrice-monthly $15.49 → $17.99 merchant is detected
// and flagged as a price increase.
function t(merchant: string, amount: number, date: string): RecurringTxn {
  return { merchant, name: merchant, amount, date };
}

describe("detectRecurring", () => {
  it("detects a monthly subscription and flags a price increase", () => {
    const txns: RecurringTxn[] = [
      t("Netflix", 15.49, "2026-01-05"),
      t("Netflix", 15.49, "2026-02-05"),
      t("Netflix", 17.99, "2026-03-05"),
    ];
    const out = detectRecurring(txns);
    const nf = out.find((c) => c.merchant === "Netflix");
    expect(nf).toBeTruthy();
    expect(nf!.cadence).toBe("monthly");
    expect(nf!.lastAmount).toBe(17.99);
    // avg ~16.32; last 17.99 > avg*1.1 (17.95) → flagged.
    expect(nf!.priceIncrease).toBe(true);
  });

  it("requires at least 3 charges", () => {
    const txns: RecurringTxn[] = [t("Spotify", 9.99, "2026-01-10"), t("Spotify", 9.99, "2026-02-10")];
    expect(detectRecurring(txns)).toHaveLength(0);
  });

  it("ignores high-variance merchants (not a fixed subscription)", () => {
    const txns: RecurringTxn[] = [
      t("Grocery", 40, "2026-01-03"), t("Grocery", 120, "2026-02-03"), t("Grocery", 75, "2026-03-03"),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });

  it("does not flag a steady charge as a price increase", () => {
    const txns: RecurringTxn[] = [
      t("Spotify", 9.99, "2026-01-10"), t("Spotify", 9.99, "2026-02-10"), t("Spotify", 9.99, "2026-03-10"),
    ];
    const sp = detectRecurring(txns).find((c) => c.merchant === "Spotify");
    expect(sp?.priceIncrease).toBe(false);
  });

  it("detects an annual cadence", () => {
    const txns: RecurringTxn[] = [
      t("Amazon Prime", 139, "2024-03-01"), t("Amazon Prime", 139, "2025-03-01"), t("Amazon Prime", 139, "2026-03-01"),
    ];
    const pr = detectRecurring(txns).find((c) => c.merchant === "Amazon Prime");
    expect(pr?.cadence).toBe("annual");
  });

  it("monthlyTotal normalizes annual to /12", () => {
    const total = monthlyTotal([
      { merchant: "A", cadence: "monthly", avgAmount: 10, lastAmount: 10, lastSeen: "", priceIncrease: false, count: 3 },
      { merchant: "B", cadence: "annual", avgAmount: 120, lastAmount: 120, lastSeen: "", priceIncrease: false, count: 3 },
    ]);
    expect(total).toBe(20); // 10 + 120/12
  });
});
