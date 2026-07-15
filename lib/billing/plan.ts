import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { isBillingOn } from "./switch";
import { resolveTrial, type SubRow } from "./trial";
import { isEntitled, type Feature, type Plan, minPlanFor } from "./entitlements";

// BILL B2 — the single server-side gate. requirePlan(feature) resolves the
// caller's effective plan (billing switch + trial + Stripe subscription) and
// returns a 402 upgrade_required response when they're not entitled, else null.
// Admins always pass. While billing is OFF, everyone passes (product ships free).

export interface PlanContext {
  userId: string | null;
  isAdmin: boolean;
  plan: Plan;
  inTrial: boolean;
  trialDaysLeft: number;
  gracePeriod: boolean;
  billingOn: boolean;
}

// Resolve the caller's plan context. Reads the subscription row (service role)
// + the billing switch. Safe to call on every gated route (cheap: one indexed
// read + a 60s-cached flag).
export async function getPlanContext(): Promise<PlanContext> {
  const ctx = await getUserClient();
  const billingOn = await isBillingOn();
  if (!ctx) return { userId: null, isAdmin: false, plan: "free", inTrial: false, trialDaysLeft: 0, gracePeriod: false, billingOn };

  // Billing OFF → full access for everyone; no need to read the subscription.
  if (!billingOn) return { userId: ctx.userId, isAdmin: ctx.isAdmin, plan: "premium", inTrial: false, trialDaysLeft: 0, gracePeriod: false, billingOn };

  let sub: SubRow | null = null;
  try {
    const db = serviceClient();
    if (db) {
      const { data } = await db.from("subscriptions")
        .select("plan, status, current_period_end, trial_started_at, trial_days")
        .eq("user_id", ctx.userId).maybeSingle();
      sub = (data as SubRow) ?? null;
      // Bootstrap a card-free trial row on first read (covers existing users too).
      if (!sub) {
        const trialDays = Number(process.env.TRIAL_DAYS) || 30;
        const row = { user_id: ctx.userId, plan: "trial", trial_started_at: new Date().toISOString(), trial_days: trialDays, updated_at: new Date().toISOString() };
        try { await db.from("subscriptions").upsert(row, { onConflict: "user_id" }); } catch { /* best-effort */ }
        sub = { plan: "trial", status: null, current_period_end: null, trial_started_at: row.trial_started_at, trial_days: trialDays };
      }
    }
  } catch { /* no sub → free */ }

  const t = resolveTrial(sub, Date.now());
  return { userId: ctx.userId, isAdmin: ctx.isAdmin, plan: t.effectivePlan, inTrial: t.inTrial, trialDaysLeft: t.trialDaysLeft, gracePeriod: t.gracePeriod, billingOn };
}

// Gate a route on a feature. Returns a 402 NextResponse to return early, or null
// when the caller is entitled (admin, billing-off, or sufficient plan).
export async function requirePlan(feature: Feature): Promise<NextResponse | null> {
  const pc = await getPlanContext();
  if (!pc.billingOn) return null;                 // product free while billing off
  if (pc.isAdmin) return null;                    // admins bypass (QA)
  if (isEntitled(feature, pc.plan, pc.isAdmin)) return null;
  return NextResponse.json(
    { error: "upgrade_required", feature, requiredPlan: minPlanFor(feature) },
    { status: 402 },
  );
}
