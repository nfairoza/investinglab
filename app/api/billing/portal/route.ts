import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { stripeConfigured, createPortalSession } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

// POST /api/billing/portal — open the Stripe Customer Portal (upgrade, downgrade,
// cancel, update card). We build NONE of that UI ourselves. Cancellation is one
// click here — no dark patterns.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id").eq("user_id", ctx.userId).maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: "no_customer" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await createPortalSession({ customerId: sub.stripe_customer_id, returnUrl: `${appUrl}/settings/billing` });
  return NextResponse.json({ url: session.url });
}
