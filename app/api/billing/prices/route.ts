import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/billing/prices — expose the configured Stripe price IDs to the client
// (public price ids, safe to expose). The client passes one to /checkout, which
// re-validates it against the same env. Absent ids → the buy button is disabled.
export async function GET() {
  return NextResponse.json({
    premiumMonthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY ?? null,
    premiumYearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY ?? null,
    proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? null,
    proYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? null,
  });
}
