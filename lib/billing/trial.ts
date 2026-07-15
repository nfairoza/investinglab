// BILL B0 — pure trial math. Given a subscription row + now, resolve the
// effective plan and the trial state. Deterministic + testable; no I/O.

import type { Plan } from "./entitlements";

export interface SubRow {
  plan: string | null;                 // 'trial' | 'free' | 'premium' | 'pro'
  status: string | null;               // Stripe status
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_days: number | null;
}

export interface TrialState {
  effectivePlan: Plan;    // what gating should use
  inTrial: boolean;
  trialDaysLeft: number;  // 0 when not in trial
  gracePeriod: boolean;   // past_due but within 3-day grace after period end
}

const DAY = 86_400_000;
const GRACE_DAYS = 3;

function planOf(raw: string | null | undefined): Plan {
  const p = String(raw ?? "").toLowerCase();
  return p === "pro" || p === "premium" ? p : "free";
}

/**
 * Resolve the effective plan. Rules:
 *  - A card-free trial (plan='trial') grants FULL access (premium) until the
 *    trial_days window elapses; after that it drops to free unless a paid
 *    subscription exists.
 *  - An active/trialing Stripe subscription → its plan.
 *  - past_due within the 3-day grace after current_period_end → keep the paid
 *    plan (grace banner shown); after grace → free.
 *  - canceled/other → free.
 */
export function resolveTrial(sub: SubRow | null, nowMs: number): TrialState {
  if (!sub) return { effectivePlan: "free", inTrial: false, trialDaysLeft: 0, gracePeriod: false };

  const status = String(sub.status ?? "").toLowerCase();
  const paidPlan = planOf(sub.plan);

  // Card-free trial window.
  if (sub.plan === "trial" && sub.trial_started_at) {
    const started = Date.parse(sub.trial_started_at);
    const days = sub.trial_days ?? 30;
    const elapsedDays = (nowMs - started) / DAY;
    const left = Math.max(0, Math.ceil(days - elapsedDays));
    if (elapsedDays < days) {
      return { effectivePlan: "premium", inTrial: true, trialDaysLeft: left, gracePeriod: false };
    }
    // Trial elapsed, no conversion → free.
    return { effectivePlan: "free", inTrial: false, trialDaysLeft: 0, gracePeriod: false };
  }

  // Active / trialing Stripe subscription.
  if (status === "active" || status === "trialing") {
    return { effectivePlan: paidPlan, inTrial: status === "trialing", trialDaysLeft: 0, gracePeriod: false };
  }

  // Grace: past_due but within GRACE_DAYS after the period end → keep access.
  if (status === "past_due" && sub.current_period_end) {
    const end = Date.parse(sub.current_period_end);
    if (nowMs <= end + GRACE_DAYS * DAY) {
      return { effectivePlan: paidPlan, inTrial: false, trialDaysLeft: 0, gracePeriod: true };
    }
  }

  return { effectivePlan: "free", inTrial: false, trialDaysLeft: 0, gracePeriod: false };
}
