import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { dividendsForSymbols, positionIncome, type PositionIncome } from "@/lib/income/dividends";

export const dynamic = "force-dynamic";

// GET /api/income — F4 dividend & income view. Per-position forward yield,
// yield-on-cost, projected annual income + portfolio totals + a 12-month payout
// calendar (by next ex-date month, coarse). asOf carried for honesty.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const holdings = (await getUnifiedHoldings(ctx.supabase, { userId: ctx.userId, realTickersOnly: true }).catch(() => []))
    .filter((h) => h.symbol && !h.symbol.includes("-"));
  if (!holdings.length) return NextResponse.json({ positions: [], totals: { projectedAnnualIncome: 0, thisMonthExpected: 0 }, calendar: [] });

  const symbols = holdings.map((h) => h.symbol);
  const [quotes, divs] = await Promise.all([
    marketData.getQuotes(symbols).catch(() => ({} as Record<string, DataResult<Quote>>)),
    dividendsForSymbols(symbols),
  ]);

  const positions: PositionIncome[] = holdings.map((h) => {
    const price = quotes[h.symbol]?.data?.price ?? null;
    const div = divs[h.symbol] ?? { symbol: h.symbol, annualPerShare: 0, frequency: 0, nextExDate: null, lastAmount: 0 };
    return positionIncome({ symbol: h.symbol, shares: h.shares, price, avgCost: h.avgCost || null, div });
  }).filter((p) => p.projectedAnnualIncome > 0);

  positions.sort((a, b) => b.projectedAnnualIncome - a.projectedAnnualIncome);

  const projectedAnnualIncome = +positions.reduce((s, p) => s + p.projectedAnnualIncome, 0).toFixed(2);
  // Payout calendar: distribute each position's annual income across its payment
  // months by frequency (even split — FMP doesn't give a reliable forward
  // schedule, so this is a projection, labeled as such in the UI).
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const calendar = monthNames.map((m) => ({ month: m, amount: 0 }));
  for (const p of positions) calendar.forEach((c) => { c.amount += p.projectedAnnualIncome / 12; });
  calendar.forEach((c) => { c.amount = +c.amount.toFixed(2); });
  const thisMonthExpected = calendar[new Date().getMonth()].amount;

  return NextResponse.json({
    positions,
    totals: { projectedAnnualIncome, thisMonthExpected },
    calendar,
    asOf: new Date().toISOString(),
  });
}
