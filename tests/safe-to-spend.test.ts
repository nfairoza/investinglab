import { describe, it, expect } from "vitest";
import {
  computeSafeToSpend, nextPaydayFor, nextExpectedFor, buildCashflowCalendar,
  type SafeToSpendInput, type IncomeCadence, type UpcomingBill,
} from "@/lib/money/safe-to-spend";

const biweekly: IncomeCadence = { source: "ACME PAYROLL", cadence: "biweekly", lastDate: "2026-07-10", avgAmount: 2400 };
const monthly: IncomeCadence = { source: "RENT INC", cadence: "monthly", lastDate: "2026-06-15", avgAmount: 5000 };

const bills = (over: Partial<UpcomingBill>[] = []): UpcomingBill[] => [
  { merchant: "Rent", amount: 1800, nextExpected: "2026-07-01" },
  { merchant: "Electric", amount: 120, nextExpected: "2026-07-18" },
  { merchant: "Netflix", amount: 16, nextExpected: "2026-07-22" },
  ...over,
] as UpcomingBill[];

describe("nextPaydayFor", () => {
  it("walks a biweekly stream forward to the next date after now", () => {
    expect(nextPaydayFor(biweekly, "2026-07-15")).toBe("2026-07-24");
    expect(nextPaydayFor(biweekly, "2026-07-24")).toBe("2026-08-07"); // strictly after
  });
  it("rolls a monthly stream by calendar month keeping day-of-month", () => {
    expect(nextPaydayFor(monthly, "2026-07-15")).toBe("2026-08-15");
    expect(nextPaydayFor(monthly, "2026-06-20")).toBe("2026-07-15");
  });
  it("returns null for irregular income", () => {
    expect(nextPaydayFor({ ...biweekly, cadence: "irregular" }, "2026-07-15")).toBeNull();
  });
});

describe("computeSafeToSpend", () => {
  it("subtracts only bills due before the next payday, plus buffer", () => {
    // now Jul 15, next biweekly payday Jul 24. Bills before Jul 24: Electric(120, Jul18), Netflix(16, Jul22).
    // Rent(Jul 1) is in the past → excluded.
    const input: SafeToSpendInput = { liquidBalance: 3000, bills: bills(), income: [biweekly], buffer: 200, now: "2026-07-15" };
    const r = computeSafeToSpend(input);
    expect(r.nextPayday).toBe("2026-07-24");
    expect(r.irregularIncome).toBe(false);
    expect(r.billsDue.map((b) => b.merchant)).toEqual(["Electric", "Netflix"]);
    expect(r.billsDueTotal).toBe(136);
    expect(r.safeToSpend).toBe(3000 - 136 - 200);
  });

  it("falls back to a 30-day window (labeled) when income is irregular", () => {
    const input: SafeToSpendInput = { liquidBalance: 2000, bills: bills(), income: [{ ...biweekly, cadence: "irregular" }], buffer: 200, now: "2026-07-15" };
    const r = computeSafeToSpend(input);
    expect(r.irregularIncome).toBe(true);
    expect(r.nextPayday).toBeNull();
    expect(r.horizonEnd).toBe("2026-08-14"); // now + 30d
    // All future bills within 30d counted (Electric + Netflix; Rent is past).
    expect(r.billsDueTotal).toBe(136);
  });

  it("excludes a bill paid early (its next_expected already advanced past now)", () => {
    // Electric was paid → its next_expected is next month, outside the payday horizon.
    const input: SafeToSpendInput = {
      liquidBalance: 3000,
      bills: bills([]).map((b) => b.merchant === "Electric" ? { ...b, nextExpected: "2026-08-18" } : b),
      income: [biweekly], buffer: 200, now: "2026-07-15",
    };
    const r = computeSafeToSpend(input);
    expect(r.billsDue.map((b) => b.merchant)).toEqual(["Netflix"]);
    expect(r.safeToSpend).toBe(3000 - 16 - 200);
  });

  it("renders a negative safe-to-spend honestly (no clamping)", () => {
    const input: SafeToSpendInput = { liquidBalance: 100, bills: bills(), income: [biweekly], buffer: 200, now: "2026-07-15" };
    const r = computeSafeToSpend(input);
    expect(r.safeToSpend).toBe(100 - 136 - 200);
    expect(r.safeToSpend).toBeLessThan(0);
  });

  it("uses the SOONEST payday across multiple streams", () => {
    // biweekly next = Jul 24; monthly(lastDate Jun 15) next = Jul 15 -> but now is Jul 15 so → Aug 15.
    const input: SafeToSpendInput = { liquidBalance: 3000, bills: bills(), income: [biweekly, monthly], buffer: 0, now: "2026-07-16" };
    const r = computeSafeToSpend(input);
    expect(r.nextPayday).toBe("2026-07-24"); // biweekly is sooner than Aug 15
  });
});

describe("nextExpectedFor", () => {
  it("adds one month for monthly, one year for annual", () => {
    expect(nextExpectedFor("2026-07-18", "monthly")).toBe("2026-08-18");
    expect(nextExpectedFor("2026-12-31", "monthly")).toBe("2027-01-31");
    expect(nextExpectedFor("2026-03-01", "annual")).toBe("2027-03-01");
  });
});

describe("buildCashflowCalendar", () => {
  it("places future bills and the next income marker within the window", () => {
    const input: SafeToSpendInput = { liquidBalance: 3000, bills: bills(), income: [biweekly], buffer: 200, now: "2026-07-15" };
    const cal = buildCashflowCalendar(input, 30);
    const dates = cal.map((c) => c.date);
    expect(dates).toContain("2026-07-18"); // Electric
    expect(dates).toContain("2026-07-22"); // Netflix
    expect(dates).toContain("2026-07-24"); // payday income marker
    const payday = cal.find((c) => c.date === "2026-07-24")!;
    expect(payday.income[0].source).toBe("ACME PAYROLL");
  });
});
