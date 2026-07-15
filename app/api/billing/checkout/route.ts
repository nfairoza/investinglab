import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { stripeConfigured, findOrCreateCustomer, createCheckoutSession } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

// POST /api/billing/checkout { priceId } — start a Stripe Checkout Session for
// the signed-in user. Creates/reuses the Stripe customer (stored on the
// subscription row) and returns the hosted Checkout URL. This is the conversion
// moment — the FIRST time Stripe is involved (no card collected before here).
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const priceId = String(body?.priceId ?? "").trim();
  const allowed = [
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY, process.env.STRIPE_PRICE_PREMIUM_YEARLY,
    process.env.STRIPE_PRICE_PRO_MONTHLY, process.env.STRIPE_PRICE_PRO_YEARLY,
  ].filter(Boolean);
  if (!priceId || !allowed.includes(priceId)) return NextResponse.json({ error: "invalid_price" }, { status: 400 });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Reuse an existing Stripe customer id if we have one.
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id").eq("user_id", ctx.userId).maybeSingle();
  const { data: userInfo } = await db.auth.admin.getUserById(ctx.userId).catch(() => ({ data: { user: null } } as any));
  const email = userInfo?.user?.email ?? null;

  const customerId = await findOrCreateCustomer({ userId: ctx.userId, email, existingId: sub?.stripe_customer_id });
  // Persist the customer id immediately (webhook will fill the rest).
  await db.from("subscriptions").upsert(
    { user_id: ctx.userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await createCheckoutSession({
    customerId,
    priceId,
    successUrl: `${appUrl}/settings/billing?checkout=success`,
    cancelUrl: `${appUrl}/pricing?checkout=cancelled`,
    trialDays: 14,
  });
  return NextResponse.json({ url: session.url });
}
