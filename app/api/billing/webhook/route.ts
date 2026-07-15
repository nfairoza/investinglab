import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/service-client";
import { verifyWebhookSignature } from "@/lib/billing/stripe";
import { reduceEvent } from "@/lib/billing/webhook";

export const dynamic = "force-dynamic";

// POST /api/billing/webhook — the ONLY writer of `subscriptions`. Verifies the
// Stripe signature, is idempotent (a replayed event id is a no-op via
// billing_events), and resolves the target user from the customer's metadata.
// On any processing failure we return 500 so Stripe retries.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();

  if (!secret || !verifyWebhookSignature(payload, sig, secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(payload); } catch { return NextResponse.json({ error: "bad_payload" }, { status: 400 }); }

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  // Idempotency: a replayed event id is a no-op.
  const eventId = String(event?.id ?? "");
  if (eventId) {
    const { data: seen } = await db.from("billing_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (seen) return NextResponse.json({ received: true, duplicate: true });
  }

  const reduced = reduceEvent(event);
  if (reduced) {
    try {
      // Resolve the user. Prefer the subscription row keyed by customer id; else
      // read the customer's metadata.user_id from Stripe (already stored at
      // checkout, so the row lookup usually succeeds).
      let userId: string | null = null;
      if (reduced.customerId) {
        const { data: row } = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", reduced.customerId).maybeSingle();
        userId = row?.user_id ?? null;
      }
      if (userId) {
        const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
        for (const [k, v] of Object.entries(reduced.update)) if (v !== undefined && k !== "userId") patch[k] = v;
        await db.from("subscriptions").upsert(patch, { onConflict: "user_id" });
      }
      // else: no row yet for this customer — a subsequent event (or the checkout
      // row we wrote) will reconcile it. Still record the event as seen.
    } catch (e) {
      // Return 500 so Stripe retries (webhook resilience, B3).
      return NextResponse.json({ error: "processing_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 500 });
    }
  }

  if (eventId) {
    try { await db.from("billing_events").upsert({ event_id: eventId, event_type: event?.type ?? null }, { onConflict: "event_id" }); } catch { /* best-effort */ }
  }
  return NextResponse.json({ received: true });
}
