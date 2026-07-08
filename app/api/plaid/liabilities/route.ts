import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { readSnapshots, writeSnapshot, SNAPSHOT_TTL_MS } from "@/lib/plaid-snapshot";
import type { LiabilitiesGetResponse } from "plaid";

export const dynamic = "force-dynamic";

// The subset of a Plaid liabilitiesGet response we snapshot + read back.
type LiabPayload = Pick<LiabilitiesGetResponse, "accounts" | "liabilities">;

// GET /api/plaid/liabilities — credit cards, loans, and mortgages for the
// current user's linked accounts: APR, balance, next payment. Read-only.
// PA-A1: snapshot-first — reads the cached Plaid response from Postgres so the
// page paints in ms; only items lacking a snapshot are live-fetched. ?refresh=1
// forces a live pull. `stale:true` tells the client to revalidate in the bg.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ liabilities: [], configured: false });
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const { rows: items, error: itemsErr } = await selectPlaidItems(ctx.supabase, "item_id, institution_name");
  if (itemsErr) return NextResponse.json({ error: "db_error", message: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ liabilities: [] });

  const plaid = getPlaid();
  const liabilities: Record<string, unknown>[] = [];

  // Snapshot-first: build a per-item map of cached liability payloads.
  const snaps = force ? [] : await readSnapshots<LiabPayload>(ctx.supabase, "liabilities");
  const snapById = new Map(snaps.map((s) => [s.itemId, s]));

  // Only items with no cached snapshot must be live-fetched now.
  const needLive = items.filter((it) => force || !snapById.has(it.item_id));
  const results = await Promise.allSettled(
    needLive.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.liabilitiesGet({ access_token: token });
    }),
  );
  const liveById = new Map<string, LiabPayload>();
  for (let i = 0; i < needLive.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      const payload: LiabPayload = { accounts: r.value.data.accounts, liabilities: r.value.data.liabilities };
      liveById.set(needLive[i].item_id, payload);
      void writeSnapshot(ctx.supabase, ctx.userId, needLive[i].item_id, "liabilities", payload);
    }
  }

  let anyStale = false;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const payload = liveById.get(it.item_id) ?? snapById.get(it.item_id)?.payload ?? null;
    if (snapById.get(it.item_id)?.stale) anyStale = true;
    if (!payload) continue; // item may not support liabilities / no data
    {
      const acctName = new Map((payload.accounts ?? []).map((a) => [a.account_id, a]));
      const L = payload.liabilities ?? {};

      for (const c of L.credit ?? []) {
        const a = c.account_id ? acctName.get(c.account_id) : undefined;
        liabilities.push({
          kind: "credit", institution: it.institution_name,
          name: a?.name ?? "Credit card", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          limit: a?.balances?.limit ?? null,
          apr: c.aprs?.[0]?.apr_percentage ?? null,
          nextPaymentDue: c.next_payment_due_date ?? null,
          minPayment: c.minimum_payment_amount ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
      for (const m of L.mortgage ?? []) {
        const a = m.account_id ? acctName.get(m.account_id) : undefined;
        liabilities.push({
          kind: "mortgage", institution: it.institution_name,
          name: a?.name ?? "Mortgage", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          apr: m.interest_rate?.percentage ?? null,
          nextPaymentDue: m.next_payment_due_date ?? null,
          minPayment: m.next_monthly_payment ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
      for (const s of L.student ?? []) {
        const a = s.account_id ? acctName.get(s.account_id) : undefined;
        liabilities.push({
          kind: "student", institution: it.institution_name,
          name: a?.name ?? "Student loan", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          apr: s.interest_rate_percentage ?? null,
          nextPaymentDue: s.next_payment_due_date ?? null,
          minPayment: s.minimum_payment_amount ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
    }
  }

  const oldest = snaps.length ? snaps.reduce((m, s) => Math.min(m, new Date(s.fetchedAt).getTime()), Date.now()) : null;
  return NextResponse.json({
    liabilities,
    stale: anyStale,
    asOf: oldest ? new Date(oldest).toISOString() : null,
    ttlMs: SNAPSHOT_TTL_MS,
  });
}
