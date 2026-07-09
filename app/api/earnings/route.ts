import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { earningsForSymbols } from "@/lib/earnings/calendar";

export const dynamic = "force-dynamic";

// GET /api/earnings — upcoming earnings for the user's held symbols (24h cached
// per symbol). Returns a map symbol→event plus the next-14-days list for the
// Portfolio strip.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const holdings = await getUnifiedHoldings(ctx.supabase, { userId: ctx.userId, realTickersOnly: true }).catch(() => []);
  const symbols = holdings.map((h) => h.symbol).filter((s) => s && !s.includes("-")); // skip crypto pairs
  if (!symbols.length) return NextResponse.json({ bySymbol: {}, upcoming: [] });

  const bySymbol = await earningsForSymbols(symbols);
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = Object.values(bySymbol)
    .filter((e) => e.date && e.date >= today && e.date <= in14)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return NextResponse.json({ bySymbol, upcoming });
}
