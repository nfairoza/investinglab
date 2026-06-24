import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function merchantKey(name: string | null, fallback: string): string {
  return (name || fallback || "").toLowerCase().trim();
}

// Pull new activity from Plaid (incremental) and upsert into the cache. Plaid's
// cursor only returns NEW transactions, so we persist them to read history later.
async function syncToCache(ctx: { supabase: SupabaseClient; userId: string }) {
  const { data: items } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, access_token, cursor");
  if (!items?.length) return;
  const plaid = getPlaid();

  for (const it of items) {
    try {
      let cursor: string | undefined = it.cursor ?? undefined;
      const added: any[] = [];
      const removed: string[] = [];
      let hasMore = true;
      for (let guard = 0; guard < 12 && hasMore; guard++) {
        const resp = await plaid.transactionsSync({ access_token: it.access_token, cursor });
        added.push(...resp.data.added, ...resp.data.modified);
        removed.push(...resp.data.removed.map((r) => r.transaction_id).filter(Boolean) as string[]);
        cursor = resp.data.next_cursor;
        hasMore = resp.data.has_more;
      }
      if (added.length) {
        const rows = added.map((t) => ({
          user_id: ctx.userId,
          transaction_id: t.transaction_id,
          item_id: it.item_id,
          account_id: t.account_id,
          date: t.date,
          name: t.name,
          merchant: t.merchant_name ?? null,
          amount: t.amount,
          currency: t.iso_currency_code ?? "USD",
          plaid_category: t.personal_finance_category?.primary ?? (t.category?.[0] ?? null),
          institution: it.institution_name,
          pending: t.pending ?? false,
          removed: false,
        }));
        await ctx.supabase.from("plaid_transactions").upsert(rows, { onConflict: "user_id,transaction_id" });
      }
      if (removed.length) {
        await ctx.supabase.from("plaid_transactions").update({ removed: true }).in("transaction_id", removed);
      }
      await ctx.supabase.from("plaid_items").update({ cursor, updated_at: new Date().toISOString() }).eq("item_id", it.item_id);
    } catch { /* skip item on error */ }
  }
}

// GET /api/plaid/transactions — syncs, then returns cached transactions with
// user categorization applied. Query: ?account=&category=&from=&to=&q=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ transactions: [], configured: false });

  const sp = req.nextUrl.searchParams;
  const skipSync = sp.get("sync") === "0";
  if (!skipSync) await syncToCache(ctx).catch(() => {});

  // Read cache + the two override layers.
  const [{ data: txns }, { data: rules }, { data: overrides }] = await Promise.all([
    ctx.supabase.from("plaid_transactions").select("*").eq("removed", false).order("date", { ascending: false }).limit(500),
    ctx.supabase.from("plaid_merchant_rules").select("merchant_key, category"),
    ctx.supabase.from("plaid_txn_overrides").select("*"),
  ]);

  const ruleMap = new Map((rules ?? []).map((r: any) => [r.merchant_key, r.category]));
  const ovMap = new Map((overrides ?? []).map((o: any) => [o.transaction_id, o]));

  const account = sp.get("account");
  const category = sp.get("category");
  const from = sp.get("from");
  const to = sp.get("to");
  const q = (sp.get("q") ?? "").toLowerCase();
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);

  const out = (txns ?? []).map((t: any) => {
    const ov = ovMap.get(t.transaction_id);
    const rule = ruleMap.get(merchantKey(t.merchant, t.name));
    const cat = ov?.category ?? rule ?? t.plaid_category ?? "Uncategorized";
    return {
      id: t.transaction_id,
      date: t.date,
      name: t.name,
      merchant: t.merchant,
      amount: Number(t.amount),
      currency: t.currency,
      category: cat,
      institution: t.institution,
      accountId: t.account_id,
      pending: t.pending,
      isTransfer: ov?.is_transfer ?? false,
      excluded: ov?.excluded ?? false,
    };
  }).filter((t) => {
    if (account && t.institution !== account) return false;
    if (category && t.category !== category) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (q && !(`${t.name} ${t.merchant ?? ""}`.toLowerCase().includes(q))) return false;
    return true;
  }).slice(0, limit);

  return NextResponse.json({ transactions: out });
}

// PATCH /api/plaid/transactions — recategorize / flag. Body:
//   { transactionId, category?, applyToMerchant?, isTransfer?, excluded?, merchant? }
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const transactionId = String(body?.transactionId ?? "");
  if (!transactionId) return NextResponse.json({ error: "transactionId required" }, { status: 400 });

  // Per-transaction override.
  const patch: Record<string, any> = { user_id: ctx.userId, transaction_id: transactionId, updated_at: new Date().toISOString() };
  if (typeof body.category === "string") patch.category = body.category;
  if (typeof body.isTransfer === "boolean") patch.is_transfer = body.isTransfer;
  if (typeof body.excluded === "boolean") patch.excluded = body.excluded;
  await ctx.supabase.from("plaid_txn_overrides").upsert(patch, { onConflict: "user_id,transaction_id" });

  // Optional: "always categorize this merchant as X".
  if (body.applyToMerchant && typeof body.category === "string" && typeof body.merchant === "string") {
    const key = merchantKey(body.merchant, "");
    if (key) {
      await ctx.supabase.from("plaid_merchant_rules").upsert(
        { user_id: ctx.userId, merchant_key: key, category: body.category, updated_at: new Date().toISOString() },
        { onConflict: "user_id,merchant_key" },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
