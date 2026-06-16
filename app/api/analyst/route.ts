import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  return NextResponse.json(await marketData.getAnalystData(symbol));
}
