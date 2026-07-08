import type { SupabaseClient } from "@supabase/supabase-js";

// Plaid response snapshots (PA-A1). Read the last cached Plaid response from
// Postgres FIRST so pages paint in tens of ms instead of waiting 1-3s per Plaid
// round trip. A snapshot older than the freshness window is served stale and a
// background refresh is triggered (fire-and-forget); SWR revalidation on the
// client then picks up the fresher data.

export type SnapshotKind = "balances" | "liabilities" | "investments";
export const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface Snapshot<T = unknown> { itemId: string; payload: T; fetchedAt: string; stale: boolean }

// Read all snapshots of a kind for the user. `stale` is set per row against the
// TTL so callers can decide whether to trigger a background refresh.
export async function readSnapshots<T = unknown>(
  supabase: SupabaseClient,
  kind: SnapshotKind,
): Promise<Snapshot<T>[]> {
  const { data } = await supabase
    .from("plaid_snapshot")
    .select("item_id, payload, fetched_at")
    .eq("kind", kind);
  const now = Date.now();
  return (data ?? []).map((r: { item_id: string; payload: T; fetched_at: string }) => ({
    itemId: r.item_id,
    payload: r.payload,
    fetchedAt: r.fetched_at,
    stale: now - new Date(r.fetched_at).getTime() > SNAPSHOT_TTL_MS,
  }));
}

// Persist one item's response (upsert on user+item+kind). Best-effort.
export async function writeSnapshot(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  kind: SnapshotKind,
  payload: unknown,
): Promise<void> {
  try {
    await supabase.from("plaid_snapshot").upsert(
      { user_id: userId, item_id: itemId, kind, payload, fetched_at: new Date().toISOString() },
      { onConflict: "user_id,item_id,kind" },
    );
  } catch { /* never break a read path on a snapshot write */ }
}

// True if any snapshot is missing or stale (so a caller with N items can decide
// to kick a background refresh). `expectedItems` is the current linked-item count.
export function needsRefresh(snapshots: Snapshot[], expectedItems: number): boolean {
  if (snapshots.length < expectedItems) return true;
  return snapshots.some((s) => s.stale);
}
