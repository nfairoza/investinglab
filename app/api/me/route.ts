import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isAdminUser } from "@/lib/supabase-data";
import { isDemoRequest, demoIdentity } from "@/lib/demo/session";
import { getPlanContext } from "@/lib/billing/plan";

export const dynamic = "force-dynamic";

// Returns the current user's identity + admin flag + resolved plan/trial state
// for UI gating (Locked components, trial banner). Real enforcement is
// server-side per route; this feeds display.
export async function GET() {
  if (isDemoRequest()) return NextResponse.json(demoIdentity());
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false, isAdmin: false });
  // Resolve the effective plan (billing switch + trial + subscription).
  const pc = await getPlanContext();
  return NextResponse.json({
    authenticated: true,
    isAdmin: isAdminUser(user),
    // Effective plan + billing state. While billingOn is false, gated features
    // ship to everyone (plan reports "premium") — see lib/billing/plan.
    plan: pc.plan,
    billingEnabled: pc.billingOn,
    inTrial: pc.inTrial,
    trialDaysLeft: pc.trialDaysLeft,
    gracePeriod: pc.gracePeriod,
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
    provider: (user.app_metadata?.provider as string) ?? "email",
    avatarUrl: (user.user_metadata?.avatar_url as string) ?? (user.user_metadata?.picture as string) ?? null,
    fullName: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
    phone: (user.user_metadata?.phone as string) ?? user.phone ?? null,
  });
}
