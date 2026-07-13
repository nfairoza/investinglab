import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/trades — reads ONLY the local normalized table (never a
// provider). Filters: ?source=&person=&window=&type=&q=&limit=
// window: 30d | 90d | 1y | all
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ rows: [], note: "not_configured" });

  const sp = req.nextUrl.searchParams;
  const source = sp.get("source");
  const person = sp.get("person");
  const type = sp.get("type");
  const q = (sp.get("q") ?? "").trim();
  const windowKey = sp.get("window") ?? "90d";
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);
  const committeeOnly = sp.get("committeeOverlap") === "1";

  const days = windowKey === "30d" ? 30 : windowKey === "90d" ? 90 : windowKey === "1y" ? 365 : null;
  // PT1: embed the cached returns row (lag + since-trade/disclosure move). PT4:
  // embed the committee-jurisdiction flag. Both are nightly-computed LEFT JOINs —
  // absent for trades not yet processed (rendered as "—" / no chip).
  let query = sb
    .from("power_trade_records")
    .select("*, power_trade_returns(lag_days,since_trade_pct,since_disclosure_pct,as_of), power_trade_flags(committee_overlap,overlap_level,committee,sector)")
    .order("disclosure_date", { ascending: false })
    .limit(limit);
  // "committee-overlap trades only" — an inner join on the flag being true.
  if (committeeOnly) {
    query = sb
      .from("power_trade_records")
      .select("*, power_trade_returns(lag_days,since_trade_pct,since_disclosure_pct,as_of), power_trade_flags!inner(committee_overlap,overlap_level,committee,sector)")
      .eq("power_trade_flags.committee_overlap", true)
      .order("disclosure_date", { ascending: false })
      .limit(limit);
  }
  if (source && source !== "all") query = query.eq("source", source);
  if (person) query = query.ilike("person_name", `%${person}%`);
  if (type && type !== "all") query = query.eq("transaction_type", type);
  if (days != null) query = query.gte("transaction_date", new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
  if (q) query = query.or(`person_name.ilike.%${q}%,ticker.ilike.%${q}%,asset_name.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });
  // Flatten the embedded returns onto the trade row for a flat client shape.
  const rows = (data ?? []).map((r: any) => {
    const ret = Array.isArray(r.power_trade_returns) ? r.power_trade_returns[0] : r.power_trade_returns;
    const flag = Array.isArray(r.power_trade_flags) ? r.power_trade_flags[0] : r.power_trade_flags;
    const { power_trade_returns: _r, power_trade_flags: _f, ...trade } = r;
    return {
      ...trade,
      lag_days: ret?.lag_days ?? null,
      since_trade_pct: ret?.since_trade_pct ?? null,
      since_disclosure_pct: ret?.since_disclosure_pct ?? null,
      return_as_of: ret?.as_of ?? null,
      committee_overlap: flag?.committee_overlap ?? false,
      committee: flag?.committee ?? null,
      committee_level: flag?.overlap_level ?? null,
    };
  });
  return NextResponse.json({ rows });
}
