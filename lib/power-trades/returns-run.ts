import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { marketData } from "@/lib/providers";
import { withFmpFeature } from "@/lib/providers/fmp";
import { computeTradeReturn, type PricePoint } from "./returns";

// PT1 — nightly `pt-returns` job. For each ticker that appears on a tracked
// trade, fetch its daily price history ONCE (per-ticker global cache), then
// compute lag + since-trade/since-disclosure returns for every trade on that
// ticker and upsert into power_trade_returns. Rows render from that table; the
// UI never computes on request.
//
// Chunked by ticker cursor to respect the Hobby 10s cap: a bounded slice of
// tickers is priced per tick, wrapping over the full set across ticks.

const CURSOR_KEY = "pt-returns:cursor";
const HIST_TTL_MS = 24 * 60 * 60 * 1000;

interface TradeRow {
  id: string;
  ticker: string | null;
  transaction_date: string | null;
  disclosure_date: string | null;
}

// One ticker's daily closes, cached globally for a day (shared with anything
// else that reads price history — but keyed separately so a miss here doesn't
// evict the chart cache).
async function getDailyCloses(ticker: string): Promise<PricePoint[] | null> {
  const key = `pt:hist:${ticker.toUpperCase()}`;
  const cached = await readServerCache<PricePoint[]>(key, HIST_TTL_MS);
  if (cached.value && !cached.stale) return cached.value;

  const res = await withFmpFeature("pt_returns", () => marketData.getPriceHistory(ticker));
  const points = res.data?.points;
  if (!points || points.length === 0) return cached.value ?? null; // serve stale if present
  const clean: PricePoint[] = points
    .filter((p) => p.date && Number.isFinite(p.close))
    .map((p) => ({ date: String(p.date).slice(0, 10), close: Number(p.close) }));
  await writeServerCache(key, clean);
  return clean;
}

function todayISO(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function runPtReturns(opts: { sliceSize?: number; nowMs?: number } = {}): Promise<{ tickers: number; priced: number; rows: number; wrapped: boolean }> {
  const db = serviceClient();
  if (!db) return { tickers: 0, priced: 0, rows: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 40;
  const now = todayISO(opts.nowMs ?? Date.now());

  // Distinct tickers on record (non-null). Ordered so the cursor is stable.
  const { data: tickerRows } = await db
    .from("power_trade_records")
    .select("ticker")
    .not("ticker", "is", null)
    .limit(50_000);
  const tickers = Array.from(new Set((tickerRows ?? []).map((r: any) => String(r.ticker).toUpperCase()).filter(Boolean))).sort();
  if (tickers.length === 0) return { tickers: 0, priced: 0, rows: 0, wrapped: true };

  const cur = (await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER)).value ?? { i: 0 };
  const start = cur.i % tickers.length;
  const slice = tickers.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= tickers.length;

  let priced = 0;
  let rows = 0;
  for (const ticker of slice) {
    let closes: PricePoint[] | null;
    try { closes = await getDailyCloses(ticker); }
    catch { closes = null; }
    if (!closes || closes.length === 0) continue;
    priced++;

    const { data: trades } = await db
      .from("power_trade_records")
      .select("id,ticker,transaction_date,disclosure_date")
      .eq("ticker", ticker)
      .limit(5_000);
    const upserts = (trades ?? []).map((t: TradeRow) => {
      const r = computeTradeReturn(closes!, t.transaction_date, t.disclosure_date, now);
      return {
        trade_id: t.id,
        ticker,
        lag_days: r.lagDays,
        since_trade_pct: r.sinceTradePct,
        since_disclosure_pct: r.sinceDisclosurePct,
        trade_close: r.tradeClose,
        disclosure_close: r.disclosureClose,
        latest_close: r.latestClose,
        as_of: r.asOf,
        computed_at: new Date(opts.nowMs ?? Date.now()).toISOString(),
      };
    });
    if (upserts.length > 0) {
      await db.from("power_trade_returns").upsert(upserts, { onConflict: "trade_id" });
      rows += upserts.length;
    }
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize });
  return { tickers: tickers.length, priced, rows, wrapped };
}
