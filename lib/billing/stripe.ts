// BILL B1 — minimal Stripe REST client via fetch (no SDK dependency, matching how
// this codebase calls Anthropic/FMP). Covers: create/find customer, Checkout
// Session (subscription mode + trial + promo codes), Customer Portal session,
// and webhook signature verification.

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY not set");
  return k;
}

// Stripe wants application/x-www-form-urlencoded with bracket notation for nested
// fields. This flattens a plain object into that form.
function encodeForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) parts.push(encodeForm(v as Record<string, unknown>, key));
    else if (Array.isArray(v)) v.forEach((item, i) => parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

async function stripePost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/x-www-form-urlencoded" },
    body: encodeForm(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${json?.error?.message ?? "error"}`);
  return json;
}

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${key()}` }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe GET ${path} ${res.status}`);
  return json;
}

export async function findOrCreateCustomer(opts: { userId: string; email?: string | null; existingId?: string | null }): Promise<string> {
  if (opts.existingId) return opts.existingId;
  const cust = await stripePost("/customers", {
    email: opts.email ?? undefined,
    metadata: { user_id: opts.userId },
  });
  return cust.id as string;
}

export async function createCheckoutSession(opts: {
  customerId: string; priceId: string; successUrl: string; cancelUrl: string; trialDays?: number;
}): Promise<{ url: string; id: string }> {
  const s = await stripePost("/checkout/sessions", {
    mode: "subscription",
    customer: opts.customerId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    line_items: [{ price: opts.priceId, quantity: 1 }],
    subscription_data: opts.trialDays ? { trial_period_days: opts.trialDays } : undefined,
  });
  return { url: s.url as string, id: s.id as string };
}

export async function createPortalSession(opts: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
  const s = await stripePost("/billing_portal/sessions", { customer: opts.customerId, return_url: opts.returnUrl });
  return { url: s.url as string };
}

export async function getSubscription(subscriptionId: string): Promise<any> {
  return stripeGet(`/subscriptions/${subscriptionId}`);
}

// Verify a Stripe webhook signature (t=…,v1=…). Returns true when the signed
// payload matches within the tolerance window. Mirrors Stripe's scheme so we
// don't need the SDK.
export function verifyWebhookSignature(payload: string, sigHeader: string | null, secret: string, toleranceSec = 300, nowMs = Date.now()): boolean {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")) as [string, string][]);
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Timestamp tolerance (replay protection).
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    const a = Buffer.from(expected); const b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

// Map a Stripe price id to our plan tier via env price ids.
export function planForPrice(priceId: string | null | undefined): "premium" | "pro" | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY || priceId === process.env.STRIPE_PRICE_PREMIUM_YEARLY) return "premium";
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY || priceId === process.env.STRIPE_PRICE_PRO_YEARLY) return "pro";
  return null;
}
