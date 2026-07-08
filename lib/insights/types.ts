// =============================================================================
// Insights Engine ("The Confidant") — shared types.
//
// Core architectural law: deterministic code computes every NUMBER; the LLM only
// narrates the connective prose. So the data shapes here carry raw values +
// traceable evidence, never generated text. Narration is layered on at read time
// and validated to contain no numerals (numbers are template-slotted from
// `headlineSlots`).
// =============================================================================

// ── Ledger inputs (normalized from plaid_transactions + overrides + snapshots) ──

// A single transaction as the Ledger consumes it. Sign convention matches
// plaid_transactions / lib/money/insights.ts: amount > 0 is an EXPENSE (money
// out), amount < 0 is a DEPOSIT (money in).
export interface LedgerTxn {
  transactionId: string;
  accountId: string | null;
  date: string;            // YYYY-MM-DD
  name: string;
  merchant: string | null;
  amount: number;
  plaidCategory: string | null;   // Plaid primary personal_finance_category
  plaidDetailed: string | null;   // Plaid detailed personal_finance_category
  pending: boolean;
  removed: boolean;
}

// User-owned sticky overrides (plaid_txn_overrides). These always win over
// detected flags.
export interface TxnOverride {
  transactionId: string;
  category: string | null;
  isTransfer: boolean;
  excluded: boolean;
}

// A liability/position summary derived from plaid_snapshot. Kept minimal — the
// facts that need it (interest bleed, arbitrage) only read balance + APR.
export interface CardLiability {
  accountId: string;
  name: string;
  balance: number;         // current statement balance
  limit: number | null;    // credit limit (for utilization)
  apr: number | null;      // annual %; null → "ask the user once", never guessed
}

export interface AccountBalance {
  accountId: string;
  name: string;
  type: "depository" | "credit" | "investment" | "loan" | "other";
  subtype: string | null;
  current: number;         // current balance
  available: number | null;
  isLiquid: boolean;       // checking/savings count toward the cash buffer
}

export interface NetWorthPoint { date: string; net: number }  // for trajectory

// The Ledger's inputs bundle — everything a build needs, all from the user's data.
export interface LedgerInputs {
  txns: LedgerTxn[];
  overrides: TxnOverride[];
  balances: AccountBalance[];
  cards: CardLiability[];
  netWorthHistory: NetWorthPoint[];
}

// ── Ledger outputs ──

export type ObligationKind = "fixed" | "discretionary" | null;

// Per-transaction flags the ENGINE derived (stored in ledger_txn_flags, separate
// from the user-owned plaid_txn_overrides so a rebuild never clobbers user edits).
export interface TxnFlag {
  transactionId: string;
  isTransfer: boolean;
  transferPairId: string | null;   // the matched opposing leg, if any
  isIncome: boolean;
  obligationKind: ObligationKind;
}

export interface IncomeStream {
  source: string;
  cadence: "weekly" | "biweekly" | "monthly" | "irregular";
  avgAmount: number;
  lastSeen: string;        // YYYY-MM
  monthsObserved: number;
}

export interface LedgerMonth {
  month: string;           // YYYY-MM
  income: number;          // recurring + irregular deposits, transfers excluded
  fixed: number;           // fixed obligations
  discretionary: number;   // everything else that's spending
  savingsFlow: number;     // income − (fixed + discretionary)
  byCategory: Record<string, number>;  // display category → $ spent
}

export interface Ledger {
  months: LedgerMonth[];           // chronological, oldest → newest
  flags: TxnFlag[];                // per-transaction derived flags
  incomeStreams: IncomeStream[];
  cards: CardLiability[];          // pass-through for facts
  balances: AccountBalance[];      // pass-through for facts
  netWorthHistory: NetWorthPoint[];
  asOf: string;                    // ISO timestamp the ledger was built for
  monthsOfData: number;
}

// ── Facts (Layer 2) ──

// A cited transaction row for the "show me why" drill-down.
export interface EvidenceRow { transactionId: string; date: string; label: string; amount: number }

export interface EvidenceRef {
  kind: "txns" | "inputs";
  rows?: EvidenceRow[];            // when kind === "txns"
  inputs?: Record<string, number | string>;  // when kind === "inputs" (e.g. balances/APRs)
  note: string;                    // human-readable "based on 14 transactions Jun 1–18"
}

export interface Fact<T = number> {
  value: T;
  formulaId: string;               // stable id of the formula used (for the drill-down)
  evidence: EvidenceRef;
  asOf: string;
}

// ── Insights (Layer 3) ──

export type Severity = 1 | 2 | 3;
export type InsightStatus = "new" | "seen" | "done" | "dismissed" | "muted";

export interface InsightAction { label: string; deeplink: string }

// The structured insight a generator emits. EVERY number the UI shows lives in
// headlineSlots — the narrator only writes the words around them.
export interface StructuredInsight {
  kind: string;
  subject: string;                 // dedupe key part (e.g. category or card name)
  severity: Severity;
  headlineSlots: Record<string, number | string>;
  impactPerYear: number | null;    // $ framing, computed (drives cross-domain ranking)
  evidence: EvidenceRef[];
  factsUsed: string[];             // formulaIds
  action?: InsightAction;
  cooldownDays: number;
  positive?: boolean;              // true for reinforcement insights (celebrate, not warn)
  page?: string;                   // which surface/page this insight belongs to (for stage-3 strips)
}

// A persisted insight row (insights table) plus the lazily-attached narration.
export interface StoredInsight {
  id: string;
  kind: string;
  subject: string;
  severity: Severity;
  slots: Record<string, number | string>;
  impactPerYear: number | null;
  evidence: EvidenceRef[];
  status: InsightStatus;
  positive: boolean;
  action: InsightAction | null;
  createdAt: string;
  // Rendered at read time; template-slotted, validator-checked.
  headline?: string;
  body?: string;
}
