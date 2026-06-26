import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { marketData } from "@/lib/providers";
import type { DataResult, Quote, PriceHistory } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

// Run async jobs with a concurrency cap so we don't fire N requests at once
// (keeps us under the FMP per-minute rate limit). The provider already caches
// 90s + dedupes in-flight, so warm calls are nearly free.
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// GET /api/dashboard-data
// One round-trip for the dashboard: holdings' quotes + price histories, batched
// server-side. Replaces N client /api/quote + N /api/price-history calls.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Symbols from the UNIFIED holdings (DB + Plaid brokerage), not just the DB
  // table — otherwise a Plaid-only user gets no quotes/histories (blank charts).
  // The client may also pass ?syms= as a fast hint; union both.
  const unified = await getUnifiedHoldings(ctx.supabase, { realTickersOnly: true });
  const fromClient = (req.nextUrl.searchParams.get("syms") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const symbols = Array.from(new Set([...unified.map((h) => h.symbol), ...fromClient]));

  const quotes: Record<string, DataResult<Quote>> = {};
  const histories: Record<string, { date: string; close: number }[]> = {};

  if (symbols.length) {
    await pool(symbols, 8, async (sym) => {
      const [q, h] = await Promise.all([
        marketData.getQuote(sym).catch(() => null),
        marketData.getPriceHistory(sym).catch(() => null) as Promise<DataResult<PriceHistory> | null>,
      ]);
      if (q) quotes[sym] = q;
      histories[sym] = h?.data?.points ?? [];
    });
  }

  const anyAsOf = Object.values(quotes).find((q) => q.asOf)?.asOf ?? null;
  return NextResponse.json({ symbols, quotes, histories, asOf: anyAsOf });
}
