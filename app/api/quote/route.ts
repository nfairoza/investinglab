import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const result = await marketData.getQuote(symbol);
  // Non-personal market data: allow the CDN to serve/revalidate briefly (PA-A5).
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
  });
}
