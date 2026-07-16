// Q7 — pure diagnosis state machine for the Insights page. Kept separate from
// the route so it's unit-testable without a DB. Distinguishes 'analyzing now'
// from 'genuinely too little history' from 'pipeline error' — and NEVER blames
// "little history" when the real state is "not yet processed".

export type InsightsState = "ready" | "analyzing" | "too_little" | "error" | "empty";

export interface DiagnoseInput {
  hasInsights: boolean;       // any surfaced insight rows for this user
  hasTxns: boolean;           // any stored transactions at all
  monthsOfData: number;       // ledger_month rows built for this user
  weeksOfData: number;        // span (weeks) between first and last transaction
  backfillState: string | null; // "running" | "done" | "error" | "idle" | null
  backfill: { state: string; monthsOfData: number; transactions: number } | null;
}

export interface InsightsDiagnosis {
  state: InsightsState;
  monthsOfData: number;
  weeksOfData: number;
  backfill: { state: string; monthsOfData: number; transactions: number } | null;
}

// Under ~6 weeks of history = genuinely too little to say anything useful.
export const MIN_WEEKS = 6;

export function diagnoseState(i: DiagnoseInput): InsightsDiagnosis {
  const base = { monthsOfData: i.monthsOfData, weeksOfData: i.weeksOfData, backfill: i.backfill };

  // Something to show already → ready (highest priority; never override real
  // insights with a loading/empty state).
  if (i.hasInsights) return { state: "ready", ...base };

  // A pipeline failure is honest and actionable — not the user's data's fault.
  if (i.backfillState === "error") return { state: "error", ...base };

  // Actively running, OR transactions exist but the ledger hasn't been built yet
  // (freshly linked, backfill mid-flight). This is "not yet processed" — it must
  // read as "analyzing", NEVER as "too little history".
  if (i.backfillState === "running" || (i.hasTxns && i.monthsOfData === 0)) {
    return { state: "analyzing", ...base };
  }

  // Processed, but genuinely not enough history to analyze.
  if (i.hasTxns && i.weeksOfData < MIN_WEEKS) return { state: "too_little", ...base };

  // Processed with enough history but nothing worth flagging, or no accounts linked.
  return { state: "empty", ...base };
}
