import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction } from "plaid";
import { getPlaid, selectPlaidItems, resolvePlaidToken, plaidEnv } from "@/lib/plaid";
import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { readCachedRate } from "@/lib/money/rates";
import { buildAndPersistForUser } from "./run";

// =============================================================================
// Q7 — Historical backfill + the first-insights moment.
//
// On initial link (and as a one-time migration for existing items), page Plaid's
// transactions/sync cursor through the FULL available history (~24 months where
// the institution provides it) and store it all. Then immediately build
// ledger_month for every month with data and run the insight generators, so a
// newly-linked user sees their first insights within minutes — not after the
// next nightly cron.
//
// Progress is tracked in server_cache under a per-user key so the /insights page
// can show "Analyzing N months of history…" and distinguish 'analyzing now' from
// 'genuinely too little history' from 'pipeline error' (never blaming little
// history when the real state is 'not yet processed').
//
// Budget: the historical pull is a ONE-TIME Plaid cost per item, not recurring.
// We log it under a distinct "sync-backfill" feature label so the accounting
// shows it apart from the incremental nightly syncs.
// =============================================================================

export type BackfillState = "idle" | "running" | "done" | "error";

export interface BackfillStatus {
  state: BackfillState;
  monthsOfData: number;      // months of history the ledger now spans
  transactions: number;      // total transactions pulled this backfill
  insightsCreated: number;
  startedAt: string | null;
  finishedAt: string | null;
  error?: string | null;
}

const BACKFILL_MONTHS = 25;  // ~24 months + current partial month
const PAGE_GUARD = 60;       // Plaid pages up to ~24mo; ample headroom

function statusKey(userId: string): string {
  return `insights:backfill:${userId}`;
}

export async function readBackfillStatus(userId: string): Promise<BackfillStatus | null> {
  const { value } = await readServerCache<BackfillStatus>(statusKey(userId)).catch(() => ({ value: null } as any));
  return value ?? null;
}

async function writeStatus(userId: string, s: BackfillStatus): Promise<void> {
  await writeServerCache(statusKey(userId), s).catch(() => {});
}

// Best-effort accounting of the one-time backfill Plaid usage under a distinct
// feature label ("sync-backfill"), so the admin cost view separates it from the
// recurring incremental syncs. We record the API pages + transactions pulled per
// item. Non-throwing — accounting must never break the backfill.
async function logBackfillUsage(db: SupabaseClient, userId: string, itemId: string, pages: number, txns: number): Promise<void> {
  try {
    await db.from("plaid_sync_usage").insert({
      user_id: userId, item_id: itemId, feature: "sync-backfill",
      env: plaidEnv(), pages, transactions: txns,
    });
  } catch { /* accounting is best-effort — table may not exist yet on older DBs */ }
}

// Pull the FULL available history for every item this user has, persisting all
// transactions. Returns the total transaction count pulled. Uses a service-role
// client so it can run from a fire-and-forget context after link.
async function fullHistorySync(db: SupabaseClient, userId: string): Promise<number> {
  const { rows: items } = await selectPlaidItems(db, "item_id, institution_name, cursor");
  if (!items?.length) return 0;
  const plaid = getPlaid();
  let total = 0;

  await Promise.allSettled(items.map(async (it: any) => {
    const token = resolvePlaidToken(it);
    if (!token) return;
    let cursor: string | undefined = it.cursor ?? undefined;
    const added: Transaction[] = [];
    const removed: string[] = [];
    let hasMore = true;
    let pages = 0;
    for (let guard = 0; guard < PAGE_GUARD && hasMore; guard++) {
      const resp = await plaid.transactionsSync({ access_token: token, cursor });
      added.push(...resp.data.added, ...resp.data.modified);
      removed.push(...resp.data.removed.map((r) => r.transaction_id).filter(Boolean) as string[]);
      cursor = resp.data.next_cursor;
      hasMore = resp.data.has_more;
      pages++;
    }
    if (added.length) {
      const rows = added.map((t) => ({
        user_id: userId,
        transaction_id: t.transaction_id,
        item_id: it.item_id,
        account_id: t.account_id,
        date: t.date,
        name: t.name,
        merchant: t.merchant_name ?? null,
        logo_url: (t as any).logo_url ?? null,
        amount: t.amount,
        currency: t.iso_currency_code ?? "USD",
        plaid_category: t.personal_finance_category?.primary ?? (t.category?.[0] ?? null),
        plaid_detailed: t.personal_finance_category?.detailed ?? null,
        institution: it.institution_name,
        pending: t.pending ?? false,
        removed: false,
      }));
      await db.from("plaid_transactions").upsert(rows, { onConflict: "user_id,transaction_id" });
    }
    if (removed.length) {
      await db.from("plaid_transactions").update({ removed: true }).in("transaction_id", removed);
    }
    await db.from("plaid_items").update({ cursor, updated_at: new Date().toISOString() }).eq("item_id", it.item_id);
    total += added.length;
    await logBackfillUsage(db, userId, String(it.item_id), pages, added.length);
  }));

  return total;
}

// Run the whole backfill for one user: mark running → full-history sync → build
// ledger_month for every month + generate insights → mark done. Idempotent: a
// re-run just re-syncs (cursor advances) and rebuilds. Guards against concurrent
// runs via the status row. Returns the final status.
export async function runBackfill(userId: string, opts: { force?: boolean } = {}): Promise<BackfillStatus> {
  const db = serviceClient();
  const nowIso = new Date().toISOString();
  const errorStatus = (msg: string): BackfillStatus => ({
    state: "error", monthsOfData: 0, transactions: 0, insightsCreated: 0,
    startedAt: nowIso, finishedAt: new Date().toISOString(), error: msg,
  });
  if (!db) return errorStatus("service client unavailable");

  // Don't double-run: if one is already in flight (started recently), return it.
  const existing = await readBackfillStatus(userId);
  if (!opts.force && existing?.state === "running" && existing.startedAt) {
    const ageMs = Date.now() - Date.parse(existing.startedAt);
    if (ageMs < 5 * 60_000) return existing; // a run <5 min old is presumed live
  }

  const running: BackfillStatus = {
    state: "running", monthsOfData: existing?.monthsOfData ?? 0, transactions: 0,
    insightsCreated: 0, startedAt: nowIso, finishedAt: null, error: null,
  };
  await writeStatus(userId, running);

  try {
    const txns = await fullHistorySync(db, userId);
    const cachedRate = await readCachedRate();
    const liveRate = cachedRate ? { ratePct: cachedRate.ratePct, asOf: cachedRate.asOf } : null;
    // Wide window so ledger_month is built for EVERY month Plaid gave us.
    const built = await buildAndPersistForUser(db, userId, Date.now(), liveRate, BACKFILL_MONTHS);
    const done: BackfillStatus = {
      state: "done", monthsOfData: built.monthsOfData, transactions: txns,
      insightsCreated: built.insightsCreated, startedAt: nowIso, finishedAt: new Date().toISOString(), error: null,
    };
    await writeStatus(userId, done);
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backfill failed";
    const err = errorStatus(msg);
    err.startedAt = nowIso;
    await writeStatus(userId, err);
    return err;
  }
}
