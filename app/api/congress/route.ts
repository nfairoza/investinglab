import { NextRequest, NextResponse } from "next/server";
import { congressData } from "@/lib/providers";

export const dynamic = "force-dynamic";

// /api/congress                -> recent disclosures
// /api/congress?member=NAME    -> by member
// /api/congress?ticker=SYM     -> by ticker
// /api/congress?limit=50       -> cap recent results
export async function GET(req: NextRequest) {
  const member = req.nextUrl.searchParams.get("member");
  const ticker = req.nextUrl.searchParams.get("ticker");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw) || 25)) : 25;

  const result = member
    ? await congressData.getByMember(member)
    : ticker
      ? await congressData.getByTicker(ticker)
      : await congressData.getRecent(limit);

  return NextResponse.json(result);
}
