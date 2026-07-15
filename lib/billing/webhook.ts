import { planForPrice } from "./stripe";

// BILL B1 — pure webhook event → subscription-row reducer. Given a Stripe event,
// produce the fields to upsert onto the user's subscription row (or null to skip).
// Kept pure so idempotency + state transitions are unit-tested without Stripe.

export interface SubUpdate {
  userId?: string;                    // resolved from customer metadata (caller supplies)
  stripe_customer_id?: string;
  stripe_subscription_id?: string | null;
  plan?: string;
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}

// Extract the price id from a subscription object's first item.
function priceOf(sub: any): string | null {
  return sub?.items?.data?.[0]?.price?.id ?? null;
}

/**
 * Reduce a Stripe event into a subscription update. Handles:
 *  - checkout.session.completed   → link subscription + set plan/status
 *  - customer.subscription.updated → status/plan/period/cancel flags
 *  - customer.subscription.deleted → drop to free
 *  - invoice.payment_failed        → mark past_due (grace handled at read time)
 * Returns null for events we don't act on.
 */
export function reduceEvent(event: { type: string; data?: { object?: any } }): { customerId: string | null; update: SubUpdate } | null {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = obj.customer ?? null;
      return {
        customerId,
        update: {
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: obj.subscription ?? null,
          status: "active",
          // plan is set authoritatively by the following subscription.updated event;
          // default to premium so the user isn't briefly gated post-checkout.
          plan: "premium",
        },
      };
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const customerId = obj.customer ?? null;
      const plan = planForPrice(priceOf(obj)) ?? undefined;
      return {
        customerId,
        update: {
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: obj.id ?? null,
          status: obj.status ?? null,
          plan,
          current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: Boolean(obj.cancel_at_period_end),
        },
      };
    }
    case "customer.subscription.deleted": {
      return {
        customerId: obj.customer ?? null,
        update: { stripe_subscription_id: null, status: "canceled", plan: "free", cancel_at_period_end: false },
      };
    }
    case "invoice.payment_failed": {
      return { customerId: obj.customer ?? null, update: { status: "past_due" } };
    }
    default:
      return null;
  }
}
