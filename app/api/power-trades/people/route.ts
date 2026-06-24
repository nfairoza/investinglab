import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/people — People Directory (local table only).
// ?q=&category=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ rows: [], note: "not_configured" });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const category = sp.get("category");
  const limit = Math.min(Number(sp.get("limit")) || 100, 300);

  let query = sb.from("power_people").select("*").order("trade_count_all", { ascending: false }).limit(limit);
  if (category && category !== "all") query = query.eq("category", category);
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
