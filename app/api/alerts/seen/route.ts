import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ALERTDEL — mark deliveries seen. Called two ways:
//   - from the service worker when a push notification is opened ({ deliveryId })
//   - from the notifications feed when the user opens it ({ seenAll: true }) — marks
//     every unseen delivery for the user seen, so opening the app counts as "seen".
// RLS-scoped to the current user; a beacon carries the session cookie.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    deliveryId: z.string().uuid().optional(),
    seenAll: z.boolean().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const { deliveryId, seenAll } = parsed.data;

  const nowIso = new Date().toISOString();
  let q = ctx.supabase.from("alert_deliveries").update({ push_seen_at: nowIso }).is("push_seen_at", null);
  if (deliveryId) q = q.eq("id", deliveryId);
  else if (seenAll) { /* all unseen for this user (RLS scopes to the user) */ }
  else return NextResponse.json({ error: "deliveryId or seenAll required" }, { status: 400 });

  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, marked: data?.length ?? 0 });
}
