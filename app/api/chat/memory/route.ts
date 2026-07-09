import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/chat/memory — what Rukmani remembers about this user (C5 control).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("chat_memory")
    .select("id, fact, kind, updated_at").order("updated_at", { ascending: false });
  return NextResponse.json({ facts: data ?? [] });
}

// DELETE /api/chat/memory?id=... deletes one; ?all=1 clears everything.
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all) {
    await ctx.supabase.from("chat_memory").delete().eq("user_id", ctx.userId);
  } else if (id) {
    await ctx.supabase.from("chat_memory").delete().eq("user_id", ctx.userId).eq("id", id);
  } else {
    return NextResponse.json({ error: "id or all required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
