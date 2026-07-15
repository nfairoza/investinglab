import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { stripeConfigured, getSubscription, planForPrice } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

// POST /api/billing/reconcile { userId } — admin support tool. Re-pull the user's
// subscription state from Stripe and write it to our row (in case a webhook was
// missed). B3 webhook resilience backstop.
export async function POST(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!stripeConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: row } = await db.from("subscriptions").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
  if (!row?.stripe_subscription_id) return NextResponse.json({ error: "no_subscription" }, { status: 404 });

  const sub = await getSubscription(row.stripe_subscription_id);
  const priceId = sub?.items?.data?.[0]?.price?.id ?? null;
  const patch = {
    user_id: userId,
    status: sub?.status ?? null,
    plan: planForPrice(priceId) ?? "free",
    current_period_end: sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub?.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
  await db.from("subscriptions").upsert(patch, { onConflict: "user_id" });
  return NextResponse.json({ ok: true, status: patch.status, plan: patch.plan });
}
