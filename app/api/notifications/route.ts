import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET — the user's notifications (newest first). ?unread=1 for the badge count.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  let q = ctx.supabase.from("notifications").select("id, kind, payload, read_at, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (unreadOnly) q = q.is("read_at", null);
  const { data } = await q;
  const rows = data ?? [];
  return NextResponse.json({ notifications: rows, unread: rows.filter((r: any) => !r.read_at).length });
}

// PATCH — mark one (by id) or all (markAll) as read.
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    id: z.string().uuid().optional(),
    markAll: z.boolean().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const now = new Date().toISOString();
  let q = ctx.supabase.from("notifications").update({ read_at: now }).eq("user_id", ctx.userId).is("read_at", null);
  if (parsed.data.id) q = ctx.supabase.from("notifications").update({ read_at: now }).eq("user_id", ctx.userId).eq("id", parsed.data.id);
  await q;
  return NextResponse.json({ ok: true });
}
