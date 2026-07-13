import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/admin/deliveries — admin-only. Recent alert deliveries with their
// push/email outcomes for spot-checking (ALERTDEL). Optional ?userId= filter.
// Service-role read (auth enforced here); the table is RLS'd for clients.
export async function GET(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured", rows: [] });
  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const userId = req.nextUrl.searchParams.get("userId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);

  let q = sb.from("alert_deliveries")
    .select("id, alert_id, user_id, severity, triggered_at, push_sent_at, push_seen_at, email_sent_at, outcomes, payload")
    .order("triggered_at", { ascending: false })
    .limit(limit);
  if (userId) q = q.eq("user_id", userId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
