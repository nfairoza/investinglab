import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET — the current user's followed Power Trades people.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase
    .from("follows")
    .select("person_id, person_name, kind, created_at")
    .order("created_at", { ascending: false });
  return NextResponse.json({ follows: data ?? [] });
}

// POST — follow a person. Idempotent (upsert on the composite PK).
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    personId: z.string().min(1),
    personName: z.string().min(1),
    kind: z.enum(["congress", "insider"]).default("congress"),
  }));
  if (!parsed.ok) return parsed.response;
  const { personId, personName, kind } = parsed.data;
  const { error } = await ctx.supabase.from("follows").upsert(
    { user_id: ctx.userId, person_id: personId, person_name: personName, kind },
    { onConflict: "user_id,person_id" },
  );
  if (error) return NextResponse.json({ error: "follow_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — unfollow. ?personId=
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const personId = req.nextUrl.searchParams.get("personId");
  if (!personId) return NextResponse.json({ error: "missing personId" }, { status: 400 });
  await ctx.supabase.from("follows").delete().eq("user_id", ctx.userId).eq("person_id", personId);
  return NextResponse.json({ ok: true });
}
