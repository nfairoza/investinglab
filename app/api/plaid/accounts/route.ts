import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { readSnapshots, writeSnapshot, SNAPSHOT_TTL_MS } from "@/lib/plaid-snapshot";
import type { AccountBase } from "plaid";

export const dynamic = "force-dynamic";

// Shape one Plaid account into the UI row.
function shapeAccount(a: AccountBase) {
  return {
    account_id: a.account_id,
    name: a.name,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    current: a.balances?.current ?? null,
    available: a.balances?.available ?? null,
    currency: a.balances?.iso_currency_code ?? "USD",
  };
}

// GET /api/plaid/accounts — grouped account balances + total cash (depository).
// PA-A1: reads the Postgres snapshot FIRST so the page paints in ms; an item is
// only live-fetched when it has NO snapshot yet (first link). `stale:true` in the
// response tells the client to ping /api/plaid/refresh for a background refresh.
// ?refresh=1 (or the /api/plaid/refresh route) forces a live pull.
// ?debug=1 (admin) returns the RAW Plaid account types + balances.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ items: [], totalCash: 0, configured: false });
  const debug = req.nextUrl.searchParams.get("debug") === "1" && ctx.isAdmin;
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const { rows: items, error: itemsErr } = await selectPlaidItems(ctx.supabase, "item_id, institution_name, status, last_synced_at, error_code, status_changed_at");
  if (itemsErr) return NextResponse.json({ error: "db_error", message: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ items: [], totalCash: 0 });

  // Snapshot-first: build a per-item map of cached account arrays.
  const snaps = force ? [] : await readSnapshots<AccountBase[]>(ctx.supabase, "balances");
  const snapById = new Map(snaps.map((s) => [s.itemId, s]));
  const plaid = getPlaid();

  // Items with no cached snapshot must be live-fetched now (nothing to show
  // otherwise). Everything else is served from the snapshot instantly.
  const needLive = items.filter((it) => force || !snapById.has(it.item_id));
  const liveResults = await Promise.allSettled(
    needLive.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.accountsBalanceGet({ access_token: token });
    }),
  );
  const liveById = new Map<string, AccountBase[]>();
  for (let i = 0; i < needLive.length; i++) {
    const r = liveResults[i];
    if (r.status === "fulfilled") {
      const accts = r.value.data.accounts ?? [];
      liveById.set(needLive[i].item_id, accts);
      // Persist the fresh response for next time (fire-and-forget).
      void writeSnapshot(ctx.supabase, ctx.userId, needLive[i].item_id, "balances", accts);
    }
  }

  let totalCash = 0;
  const debugRows: Record<string, unknown>[] = [];
  let anyStale = false;

  // Stale-item honesty: an item whose last successful sync is older than 48h is
  // surfaced with the amber freshness treatment (distinct from the 6h balance
  // snapshot TTL — this is about the item feed going quiet, not a cache refresh).
  const STALE_ITEM_MS = 48 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const health = (it: any) => {
    const lastSynced = it.last_synced_at ? new Date(it.last_synced_at).getTime() : null;
    return {
      status: (it.status as string) ?? "active",
      lastSyncedAt: it.last_synced_at ?? null,
      errorCode: it.error_code ?? null,
      statusChangedAt: it.status_changed_at ?? null,
      itemStale: lastSynced != null && nowMs - lastSynced > STALE_ITEM_MS,
    };
  };

  const out = items.map((it) => {
    const live = liveById.get(it.item_id);
    const snap = snapById.get(it.item_id);
    const accts: AccountBase[] | null = live ?? (snap ? snap.payload : null);
    if (snap && snap.stale) anyStale = true;
    if (!accts) {
      return { itemId: it.item_id, institution: it.institution_name, accounts: [], error: "fetch_failed", ...health(it) };
    }
    if (debug) {
      for (const a of accts) {
        debugRows.push({
          institution: it.institution_name, name: a.name, mask: a.mask,
          type: a.type, subtype: a.subtype,
          available: a.balances?.available ?? null, current: a.balances?.current ?? null,
        });
      }
    }
    const accounts = accts.map((a) => {
      const bal = a.balances?.current ?? 0;
      if (a.type === "depository") totalCash += a.balances?.available ?? bal ?? 0;
      return shapeAccount(a);
    });
    return { itemId: it.item_id, institution: it.institution_name, accounts, ...health(it) };
  });

  if (debug) return NextResponse.json({ debug: debugRows });
  // `asOf` = oldest snapshot time we served, so the UI freshness chip is honest.
  const oldest = snaps.length ? snaps.reduce((m, s) => Math.min(m, new Date(s.fetchedAt).getTime()), Date.now()) : null;
  return NextResponse.json({
    items: out,
    totalCash: +totalCash.toFixed(2),
    stale: anyStale,
    asOf: oldest ? new Date(oldest).toISOString() : null,
    ttlMs: SNAPSHOT_TTL_MS,
  });
}
