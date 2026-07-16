import { describe, it, expect } from "vitest";
import { diagnoseState } from "@/lib/insights/diagnose";

// Q7: the diagnosis state machine must NEVER blame "too little history" when the
// real state is "not yet processed" (freshly linked, backfill mid-flight).
const base = { hasInsights: false, hasTxns: false, monthsOfData: 0, weeksOfData: 0, backfillState: null as string | null, backfill: null };

describe("diagnoseState", () => {
  it("ready when there are insights, regardless of everything else", () => {
    expect(diagnoseState({ ...base, hasInsights: true, backfillState: "running" }).state).toBe("ready");
  });

  it("analyzing while the backfill is running", () => {
    expect(diagnoseState({ ...base, hasTxns: true, backfillState: "running" }).state).toBe("analyzing");
  });

  it("analyzing when txns exist but the ledger hasn't been built yet (not 'too little')", () => {
    // 20 weeks of history but 0 ledger months → freshly linked, still processing.
    const d = diagnoseState({ ...base, hasTxns: true, monthsOfData: 0, weeksOfData: 20, backfillState: null });
    expect(d.state).toBe("analyzing");
    expect(d.state).not.toBe("too_little");
  });

  it("error surfaces the pipeline failure honestly", () => {
    expect(diagnoseState({ ...base, hasTxns: true, backfillState: "error" }).state).toBe("error");
  });

  it("too_little only when processed AND genuinely under ~6 weeks", () => {
    // Ledger built (monthsOfData>0), backfill done, but only 3 weeks of history.
    const d = diagnoseState({ ...base, hasTxns: true, monthsOfData: 1, weeksOfData: 3, backfillState: "done" });
    expect(d.state).toBe("too_little");
  });

  it("empty when processed with enough history but nothing to flag", () => {
    const d = diagnoseState({ ...base, hasTxns: true, monthsOfData: 6, weeksOfData: 26, backfillState: "done" });
    expect(d.state).toBe("empty");
  });

  it("empty when no accounts linked at all", () => {
    expect(diagnoseState({ ...base, hasTxns: false }).state).toBe("empty");
  });

  it("a running backfill outranks the too-little threshold", () => {
    // Even with only 2 weeks of data, an in-flight backfill reads as analyzing.
    const d = diagnoseState({ ...base, hasTxns: true, weeksOfData: 2, monthsOfData: 0, backfillState: "running" });
    expect(d.state).toBe("analyzing");
  });
});
