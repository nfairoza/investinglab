import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, planForPrice } from "@/lib/billing/stripe";
import { reduceEvent } from "@/lib/billing/webhook";
import { resolveTrial } from "@/lib/billing/trial";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const DAY = 86_400_000;

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const sign = (ts: number) => {
    const v1 = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
    return `t=${ts},v1=${v1}`;
  };

  it("accepts a valid, in-tolerance signature", () => {
    const ts = Math.floor(NOW / 1000);
    expect(verifyWebhookSignature(payload, sign(ts), secret, 300, NOW)).toBe(true);
  });
  it("rejects a tampered payload", () => {
    const ts = Math.floor(NOW / 1000);
    expect(verifyWebhookSignature(payload + "x", sign(ts), secret, 300, NOW)).toBe(false);
  });
  it("rejects an out-of-tolerance timestamp (replay)", () => {
    const old = Math.floor((NOW - 10 * 60_000) / 1000);
    expect(verifyWebhookSignature(payload, sign(old), secret, 300, NOW)).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(payload, null, secret)).toBe(false);
  });
});

describe("planForPrice", () => {
  const prev = { ...process.env };
  process.env.STRIPE_PRICE_PREMIUM_MONTHLY = "price_pm";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_py";
  it("maps env price ids to tiers", () => {
    expect(planForPrice("price_pm")).toBe("premium");
    expect(planForPrice("price_py")).toBe("pro");
    expect(planForPrice("price_unknown")).toBeNull();
  });
  Object.assign(process.env, prev);
});

describe("reduceEvent", () => {
  it("checkout.session.completed links the subscription + sets active", () => {
    const r = reduceEvent({ type: "checkout.session.completed", data: { object: { customer: "cus_1", subscription: "sub_1" } } });
    expect(r?.customerId).toBe("cus_1");
    expect(r?.update.status).toBe("active");
    expect(r?.update.stripe_subscription_id).toBe("sub_1");
  });
  it("subscription.deleted drops to free", () => {
    const r = reduceEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_1" } } });
    expect(r?.update.plan).toBe("free");
    expect(r?.update.status).toBe("canceled");
  });
  it("payment_failed marks past_due", () => {
    const r = reduceEvent({ type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } });
    expect(r?.update.status).toBe("past_due");
  });
  it("ignores unrelated events", () => {
    expect(reduceEvent({ type: "customer.created", data: { object: {} } })).toBeNull();
  });
});

describe("resolveTrial", () => {
  it("a fresh trial grants premium with days left", () => {
    const t = resolveTrial({ plan: "trial", status: null, current_period_end: null, trial_started_at: new Date(NOW - 5 * DAY).toISOString(), trial_days: 30 }, NOW);
    expect(t.effectivePlan).toBe("premium");
    expect(t.inTrial).toBe(true);
    expect(t.trialDaysLeft).toBe(25);
  });
  it("an elapsed trial drops to free", () => {
    const t = resolveTrial({ plan: "trial", status: null, current_period_end: null, trial_started_at: new Date(NOW - 40 * DAY).toISOString(), trial_days: 30 }, NOW);
    expect(t.effectivePlan).toBe("free");
    expect(t.inTrial).toBe(false);
  });
  it("an active premium subscription resolves to premium", () => {
    const t = resolveTrial({ plan: "premium", status: "active", current_period_end: new Date(NOW + 20 * DAY).toISOString(), trial_started_at: null, trial_days: 30 }, NOW);
    expect(t.effectivePlan).toBe("premium");
  });
  it("past_due within 3-day grace keeps the paid plan", () => {
    const t = resolveTrial({ plan: "premium", status: "past_due", current_period_end: new Date(NOW - 1 * DAY).toISOString(), trial_started_at: null, trial_days: 30 }, NOW);
    expect(t.effectivePlan).toBe("premium");
    expect(t.gracePeriod).toBe(true);
  });
  it("past_due beyond grace drops to free", () => {
    const t = resolveTrial({ plan: "premium", status: "past_due", current_period_end: new Date(NOW - 5 * DAY).toISOString(), trial_started_at: null, trial_days: 30 }, NOW);
    expect(t.effectivePlan).toBe("free");
    expect(t.gracePeriod).toBe(false);
  });
  it("no subscription → free", () => {
    expect(resolveTrial(null, NOW).effectivePlan).toBe("free");
  });
});
