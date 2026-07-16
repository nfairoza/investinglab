import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerInputs, LedgerTxn, TxnOverride, AccountBalance, CardLiability, NetWorthPoint, Ledger, StructuredInsight } from "./types";
import { readSnapshots } from "@/lib/plaid-snapshot";

// =============================================================================
// Persistence for the Insights Engine: load a user's LedgerInputs from Supabase,
// and write the Ledger + generated insights back. The pure parse helpers
// (extractBalances / extractCards) are exported for unit tests — the Plaid
// snapshot payloads are raw and vary, so parsing is defensive.
// =============================================================================

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Plaid balances snapshot → our AccountBalance[]. Liquid = depository
// checking/savings. Defensive against missing fields.
export function extractBalances(payloads: unknown[]): AccountBalance[] {
  const out: AccountBalance[] = [];
  for (const p of payloads) {
    const accounts = (p as any)?.accounts ?? (Array.isArray(p) ? p : []);
    if (!Array.isArray(accounts)) continue;
    for (const a of accounts) {
      const type = String(a?.type ?? "other") as AccountBalance["type"];
      const subtype = a?.subtype ? String(a.subtype) : null;
      const liquid = type === "depository" && (subtype === "checking" || subtype === "savings" || subtype == null);
      out.push({
        accountId: String(a?.account_id ?? a?.accountId ?? ""),
        name: String(a?.name ?? a?.official_name ?? "Account"),
        type: (["depository", "credit", "investment", "loan"].includes(type) ? type : "other") as AccountBalance["type"],
        subtype,
        current: num(a?.balances?.current ?? a?.current),
        available: a?.balances?.available != null ? num(a.balances.available) : null,
        isLiquid: liquid,
      });
    }
  }
  return out;
}

// Plaid liabilities snapshot → CardLiability[] (credit cards with APR + balance).
export function extractCards(payloads: unknown[]): CardLiability[] {
  const out: CardLiability[] = [];
  for (const p of payloads) {
    const credit = (p as any)?.liabilities?.credit ?? (p as any)?.credit ?? [];
    const accounts = (p as any)?.accounts ?? [];
    const nameById = new Map<string, { name: string; limit: number | null; balance: number }>();
    for (const a of Array.isArray(accounts) ? accounts : []) {
      nameById.set(String(a?.account_id ?? ""), {
        name: String(a?.name ?? "Card"),
        limit: a?.balances?.limit != null ? num(a.balances.limit) : null,
        balance: num(a?.balances?.current),
      });
    }
    for (const c of Array.isArray(credit) ? credit : []) {
      const id = String(c?.account_id ?? "");
      const meta = nameById.get(id);
      // APR: Plaid returns aprs[]; prefer the purchase APR.
      const aprs = Array.isArray(c?.aprs) ? c.aprs : [];
      const purchase = aprs.find((x: any) => /purchase/i.test(String(x?.apr_type))) ?? aprs[0];
      const apr = purchase?.apr_percentage != null ? num(purchase.apr_percentage) : null;
      out.push({
        accountId: id,
        name: meta?.name ?? "Card",
        balance: num(c?.last_statement_balance ?? meta?.balance),
        limit: meta?.limit ?? null,
        apr,
      });
    }
  }
  return out;
}

// Load everything buildLedger needs for one user. `db` may be a service-role or
// user-scoped client; queries are filtered by userId explicitly so the same code
// works for both (service role sees all rows, so we MUST scope by user).
export async function loadLedgerInputs(db: SupabaseClient, userId: string, monthsBack = 13): Promise<LedgerInputs> {
  // Trailing window of transactions. Default ~13 months (full year + current
  // partial month) for the nightly build; the one-time historical backfill passes
  // a wider window (~25 months) so ledger_month is built for EVERY month Plaid
  // gave us, not just the recent year.
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const [{ data: txnRows }, { data: ovRows }, { data: nwRows }] = await Promise.all([
    db.from("plaid_transactions")
      .select("transaction_id, account_id, date, name, merchant, amount, plaid_category, plaid_detailed, pending, removed")
      .eq("user_id", userId).gte("date", since.toISOString().slice(0, 10)),
    db.from("plaid_txn_overrides").select("transaction_id, category, is_transfer, excluded").eq("user_id", userId),
    db.from("net_worth_snapshots").select("month, net_worth").eq("user_id", userId).order("month", { ascending: true }),
  ]);

  const txns: LedgerTxn[] = (txnRows ?? []).map((r: any) => ({
    transactionId: String(r.transaction_id),
    accountId: r.account_id ?? null,
    date: String(r.date),
    name: String(r.name ?? ""),
    merchant: r.merchant ?? null,
    amount: num(r.amount),
    plaidCategory: r.plaid_category ?? null,
    plaidDetailed: r.plaid_detailed ?? null,
    pending: Boolean(r.pending),
    removed: Boolean(r.removed),
  }));

  const overrides: TxnOverride[] = (ovRows ?? []).map((r: any) => ({
    transactionId: String(r.transaction_id),
    category: r.category ?? null,
    isTransfer: Boolean(r.is_transfer),
    excluded: Boolean(r.excluded),
  }));

  const netWorthHistory: NetWorthPoint[] = (nwRows ?? []).map((r: any) => ({
    date: String(r.month), net: num(r.net_worth),
  }));

  const balSnaps = await readSnapshots(db, "balances").catch(() => []);
  const liabSnaps = await readSnapshots(db, "liabilities").catch(() => []);
  const balances = extractBalances(balSnaps.map((s) => s.payload));
  const cards = extractCards(liabSnaps.map((s) => s.payload));

  return { txns, overrides, balances, cards, netWorthHistory };
}

// Write the ledger's monthly rollups + per-txn flags (service-role, scoped by user).
export async function writeLedger(db: SupabaseClient, userId: string, ledger: Ledger): Promise<void> {
  const now = new Date().toISOString();
  if (ledger.months.length) {
    await db.from("ledger_month").upsert(
      ledger.months.map((m) => ({
        user_id: userId, month: m.month, income: m.income, fixed: m.fixed,
        discretionary: m.discretionary, savings_flow: m.savingsFlow, by_category: m.byCategory, updated_at: now,
      })),
      { onConflict: "user_id,month" },
    );
  }
  if (ledger.flags.length) {
    await db.from("ledger_txn_flags").upsert(
      ledger.flags.map((f) => ({
        user_id: userId, transaction_id: f.transactionId, is_transfer: f.isTransfer,
        transfer_pair_id: f.transferPairId, is_income: f.isIncome, obligation_kind: f.obligationKind, updated_at: now,
      })),
      { onConflict: "user_id,transaction_id" },
    );
  }
}

// Persist deduped fresh insights. New rows only (dedupe already ran upstream).
export async function writeInsights(db: SupabaseClient, userId: string, insights: StructuredInsight[]): Promise<number> {
  if (!insights.length) return 0;
  const now = new Date().toISOString();
  const rows = insights.map((i) => ({
    user_id: userId, kind: i.kind, subject: i.subject, severity: i.severity,
    slots: i.headlineSlots, impact_year: i.impactPerYear, evidence: i.evidence,
    positive: i.positive ?? false, action: i.action ?? null, status: "new", created_at: now, updated_at: now,
  }));
  const { data } = await db.from("insights").insert(rows).select("id");
  return data?.length ?? 0;
}

// Prior insights for dedupe (recent, any status, this user).
export async function loadPriorInsights(db: SupabaseClient, userId: string): Promise<{ kind: string; subject: string; severity: number; createdAt: string; status: string }[]> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await db.from("insights")
    .select("kind, subject, severity, created_at, status")
    .eq("user_id", userId).gte("created_at", since);
  return (data ?? []).map((r: any) => ({ kind: r.kind, subject: r.subject, severity: r.severity, createdAt: r.created_at, status: r.status }));
}
