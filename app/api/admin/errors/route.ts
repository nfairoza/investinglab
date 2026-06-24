import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/admin/errors — admin-only. Lists logged errors with filtering.
// Query: ?category=&severity=&q=&section=&from=&to=&limit=&offset=
// Reads via the service role (the table has no RLS policies); authorization is
// enforced here by requiring an admin session.
export async function GET(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured", rows: [], total: 0 });
  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const severity = sp.get("severity");
  const section = sp.get("section");
  const q = (sp.get("q") ?? "").trim();
  const from = sp.get("from");
  const to = sp.get("to");
  const limit = Math.min(Number(sp.get("limit")) || 100, 500);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  let query = sb.from("error_log").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (category && category !== "all") query = query.eq("category", category);
  if (severity && severity !== "all") query = query.eq("severity", severity);
  if (section) query = query.eq("section", section);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (q) query = query.or(`message.ilike.%${q}%,user_email.ilike.%${q}%,section.ilike.%${q}%`);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message, rows: [], total: 0 }, { status: 500 });

  // Distinct categories present (for filter chips) — cheap aggregate.
  const { data: cats } = await sb.from("error_log").select("category");
  const categories = Array.from(new Set((cats ?? []).map((c: any) => c.category))).sort();

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, categories });
}

// DELETE /api/admin/errors?id=  — admin-only; clear one or all logged errors.
export async function DELETE(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured" }, { status: 400 });
  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const id = req.nextUrl.searchParams.get("id");
  if (id) await sb.from("error_log").delete().eq("id", id);
  else if (req.nextUrl.searchParams.get("all") === "1") await sb.from("error_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return NextResponse.json({ ok: true });
}
