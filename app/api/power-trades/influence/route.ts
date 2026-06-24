import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/influence — Influence Context (FEC + OpenSecrets).
// Reads ONLY the local power_influence_records table (never fetches a provider on
// render). These are campaign-finance / lobbying records — NOT trades.
// ?q=&source=&type=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ rows: [], note: "not_configured" });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const source = sp.get("source");
  const type = sp.get("type");
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);

  let query = sb.from("power_influence_records").select("*").order("amount", { ascending: false, nullsFirst: false }).limit(limit);
  if (source && source !== "all") query = query.eq("source", source);
  if (type && type !== "all") query = query.eq("record_type", type);
  if (q) query = query.or(`subject_name.ilike.%${q}%,counterparty_name.ilike.%${q}%,issue_or_industry.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
