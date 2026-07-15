import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { isBillingOn, setBillingOn } from "@/lib/billing/switch";

export const dynamic = "force-dynamic";

// GET  /api/admin/billing — current master-switch state.
// POST /api/admin/billing { on: boolean } — flip it. Turning ON runs a one-time
// trial reconcile: reset trial_started_at = now for every trial user, so beta
// users get a fresh full trial instead of "your trial expired months ago".
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ billingOn: await isBillingOn() });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const on = body?.on === true;
  const wasOn = await isBillingOn();

  await setBillingOn(on);

  let reconciled = 0;
  // Reconcile ONLY on the OFF→ON transition, and only once (guarded by a config flag).
  if (on && !wasOn) {
    const db = serviceClient();
    if (db) {
      const { data: done } = await db.from("app_config").select("value").eq("key", "trial_reconciled").maybeSingle();
      if (done?.value !== "1") {
        const now = new Date().toISOString();
        const { data: rows } = await db.from("subscriptions").update({ trial_started_at: now, updated_at: now }).eq("plan", "trial").select("user_id");
        reconciled = rows?.length ?? 0;
        await db.from("app_config").upsert({ key: "trial_reconciled", value: "1", updated_at: now }, { onConflict: "key" });
      }
    }
  }

  return NextResponse.json({ billingOn: on, reconciled });
}
