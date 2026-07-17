import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { syncAllItems } from "./sync";

// =============================================================================
// Hourly plaid-sync cron. Service-role: for each user with linked items, run the
// error-aware syncAllItems (pull new/modified/removed txns from the stored
// cursor, refresh stale balance/liability snapshots past the 6h TTL, flip
// de-authed items to reauth_required + deliver the nudge, and rebuild the ledger
// on new activity). Chunked over the distinct-user list with a server_cache
// cursor so it stays under Vercel Hobby's 10s function cap (mirrors
// runInsightsBuild). The hourly cadence covers the whole base well within a day.
// =============================================================================

const CURSOR_KEY = "plaid-sync:cursor";

async function distinctItemUserIds(db: ReturnType<typeof serviceClient>): Promise<string[]> {
  if (!db) return [];
  const { data } = await db.from("plaid_items").select("user_id").limit(50_000);
  return Array.from(new Set((data ?? []).map((r: any) => String(r.user_id)))).sort();
}

export interface PlaidSyncResult { users: number; added: number; reauth: number; wrapped: boolean }

export async function runPlaidSync(opts: { sliceSize?: number } = {}): Promise<PlaidSyncResult> {
  const db = serviceClient();
  if (!db) return { users: 0, added: 0, reauth: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 25;

  const users = await distinctItemUserIds(db);
  if (!users.length) return { users: 0, added: 0, reauth: 0, wrapped: false };

  const { value: cur } = await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  const start = (cur?.i ?? 0) % users.length;
  const slice = users.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= users.length;

  let added = 0, reauth = 0;
  for (const userId of slice) {
    try {
      const results = await syncAllItems(db, userId);
      for (const r of results) {
        added += r.added;
        if (r.status === "reauth_required") reauth++;
      }
    } catch { /* skip a failing user; next tick retries */ }
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize }).catch(() => {});
  return { users: slice.length, added, reauth, wrapped };
}
