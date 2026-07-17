import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, AccountBase } from "plaid";
import { getPlaid, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { readSnapshots, writeSnapshot, SNAPSHOT_TTL_MS } from "@/lib/plaid-snapshot";
import { recordDelivery } from "@/lib/alerts/delivery";
import { buildAndPersistForUser } from "@/lib/insights/run";
import { readCachedRate } from "@/lib/money/rates";

// =============================================================================
// Shared, error-aware Plaid sync. Extracted from the read-path syncToCache so it
// can run both on-read AND from the hourly plaid-sync cron. Unlike the old loop,
// this one CATCHES per-item Plaid errors: on the ITEM_LOGIN_REQUIRED family it
// flips the item to 'reauth_required', records the error, and delivers a
// severity-2 notification (push + in-app, no email). A later successful sync of
// a reauth item clears it back to 'active'. It also refreshes the balances/
// liabilities snapshots past their 6h TTL and rebuilds the ledger when new
// transactions land, so downstream money views reflect fresh data.
// =============================================================================

export interface ItemRow {
  item_id: string;
  institution_name: string | null;
  cursor: string | null;
  status?: string | null;
  access_token?: string | null;
  access_token_enc?: string | null;
  access_token_iv?: string | null;
}

// Plaid error codes that mean "the user must re-authenticate this item". Grouped
// so the banner + reauth flow trigger on the whole family, not just one code.
const REAUTH_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "ITEM_LOCKED",
  "INSUFFICIENT_CREDENTIALS",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
]);

export function isReauthError(code: string | null | undefined): boolean {
  return code != null && REAUTH_CODES.has(code);
}

function plaidErrorCode(e: unknown): string | null {
  const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
  return typeof code === "string" ? code : null;
}

export interface ItemSyncResult {
  itemId: string;
  added: number;
  removed: number;
  status: "active" | "reauth_required";
  errorCode: string | null;
}

// Sync ONE item. `db` is service-role (cron) or user-scoped. Returns a summary;
// never throws — a per-item failure is captured in the result + item status.
export async function syncItem(db: SupabaseClient, userId: string, item: ItemRow): Promise<ItemSyncResult> {
  const nowIso = new Date().toISOString();
  const token = resolvePlaidToken(item);
  if (!token) return { itemId: item.item_id, added: 0, removed: 0, status: "reauth_required", errorCode: "NO_TOKEN" };
  const plaid = getPlaid();

  let cursor: string | undefined = item.cursor ?? undefined;
  const added: Transaction[] = [];
  const removed: string[] = [];
  let hasMore = true;

  try {
    for (let guard = 0; guard < 50 && hasMore; guard++) {
      const resp = await plaid.transactionsSync({ access_token: token, cursor });
      added.push(...resp.data.added, ...resp.data.modified);
      removed.push(...resp.data.removed.map((r) => r.transaction_id).filter(Boolean) as string[]);
      cursor = resp.data.next_cursor;
      hasMore = resp.data.has_more;
    }
  } catch (e) {
    const code = plaidErrorCode(e);
    if (isReauthError(code)) {
      await flagReauth(db, userId, item, code!);
      return { itemId: item.item_id, added: 0, removed: 0, status: "reauth_required", errorCode: code };
    }
    // Transient/other error: leave status as-is, stamp nothing, retry next tick.
    return { itemId: item.item_id, added: 0, removed: 0, status: (item.status as any) ?? "active", errorCode: code };
  }

  if (added.length) {
    const rows = added.map((t) => ({
      user_id: userId,
      transaction_id: t.transaction_id,
      item_id: item.item_id,
      account_id: t.account_id,
      date: t.date,
      name: t.name,
      merchant: t.merchant_name ?? null,
      logo_url: (t as any).logo_url ?? null,
      amount: t.amount,
      currency: t.iso_currency_code ?? "USD",
      plaid_category: t.personal_finance_category?.primary ?? (t.category?.[0] ?? null),
      plaid_detailed: t.personal_finance_category?.detailed ?? null,
      institution: item.institution_name,
      pending: t.pending ?? false,
      removed: false,
    }));
    await db.from("plaid_transactions").upsert(rows, { onConflict: "user_id,transaction_id" });
  }
  if (removed.length) {
    await db.from("plaid_transactions").update({ removed: true }).eq("user_id", userId).in("transaction_id", removed);
  }

  // Advance cursor + stamp freshness. Clear a prior reauth flag on success.
  const patch: Record<string, unknown> = { cursor, updated_at: nowIso, last_synced_at: nowIso };
  if (item.status === "reauth_required") {
    patch.status = "active"; patch.error_code = null; patch.status_changed_at = nowIso;
  }
  await db.from("plaid_items").update(patch).eq("user_id", userId).eq("item_id", item.item_id);

  return { itemId: item.item_id, added: added.length, removed: removed.length, status: "active", errorCode: null };
}

// Flip an item to reauth_required + deliver the severity-2 nudge (once, deduped).
async function flagReauth(db: SupabaseClient, userId: string, item: ItemRow, code: string): Promise<void> {
  const nowIso = new Date().toISOString();
  // Only stamp status_changed_at when actually transitioning (so "paused since"
  // stays the ORIGINAL failure time across repeated failing syncs).
  const patch: Record<string, unknown> = { status: "reauth_required", error_code: code, updated_at: nowIso };
  if (item.status !== "reauth_required") patch.status_changed_at = nowIso;
  await db.from("plaid_items").update(patch).eq("user_id", userId).eq("item_id", item.item_id);

  const name = item.institution_name ?? "Your bank";
  await recordDelivery(db, {
    alertId: null,
    userId,
    severity: 2,
    kind: "plaid_reauth",
    title: `${name} needs to be reconnected`,
    body: `${name} stopped sharing data — reconnect it to resume your balances and transactions. Your data isn't lost.`,
    url: "/accounts",
    // One nudge per item until it's fixed (dedupe is per-kind+key, not per-month).
    dedupeKey: `plaid_reauth:${item.item_id}`,
  }).catch(() => {});
}

// Refresh balances/liabilities snapshots that are past the 6h TTL for this user.
async function refreshStaleSnapshots(db: SupabaseClient, userId: string, items: ItemRow[]): Promise<void> {
  const plaid = getPlaid();
  const balSnaps = await readSnapshots(db, "balances").catch(() => []);
  const freshById = new Map(balSnaps.map((s) => [s.itemId, s.stale === false]));
  await Promise.allSettled(items.map(async (it) => {
    if (it.status === "reauth_required") return; // can't pull from a de-authed item
    const fresh = freshById.get(it.item_id);
    // Refresh when missing or stale (> 6h). readSnapshots already applied the TTL.
    if (fresh === true) return;
    const token = resolvePlaidToken(it);
    if (!token) return;
    try {
      const r = await plaid.accountsBalanceGet({ access_token: token });
      await writeSnapshot(db, userId, it.item_id, "balances", (r.data.accounts ?? []) as AccountBase[]);
    } catch { /* best-effort; a reauth error here is caught by the txn sync path */ }
  }));
}

// Sync ALL of a user's items, refresh stale snapshots, and rebuild the ledger if
// anything new landed. Returns the per-item results. Never throws.
export async function syncAllItems(db: SupabaseClient, userId: string): Promise<ItemSyncResult[]> {
  const { rows } = await selectPlaidItems(db, "item_id, institution_name, cursor, status");
  const items = (rows ?? []) as ItemRow[];
  if (!items.length) return [];

  // Items are independent; sync concurrently.
  const results = await Promise.all(items.map((it) => syncItem(db, userId, it).catch((): ItemSyncResult => ({
    itemId: it.item_id, added: 0, removed: 0, status: "active", errorCode: null,
  }))));

  await refreshStaleSnapshots(db, userId, items).catch(() => {});

  // New transactions → the ledger months are dirty; rebuild them (idempotent).
  const newTxns = results.reduce((s, r) => s + r.added + r.removed, 0);
  if (newTxns > 0) {
    const cachedRate = await readCachedRate().catch(() => null);
    const liveRate = cachedRate ? { ratePct: cachedRate.ratePct, asOf: cachedRate.asOf } : null;
    await buildAndPersistForUser(db as any, userId, Date.now(), liveRate).catch(() => {});
  }

  return results;
}

export { SNAPSHOT_TTL_MS };
