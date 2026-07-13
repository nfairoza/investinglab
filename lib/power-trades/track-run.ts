import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { marketData } from "@/lib/providers";
import { withFmpFeature } from "@/lib/providers/fmp";
import { computeTrackRecord, type DisclosedBuy } from "./track-record";
import type { PricePoint } from "./returns";

// PT3 — nightly `pt-track-records` job. Per person (chunked by cursor), gather
// their disclosed BUYs in the trailing 24 months, price each ticker + SPY once
// (per-ticker global cache, shared with pt-returns), compute excess-vs-SPY
// stats per window, and upsert power_track_records. The person page reads the
// table; nothing computes on request.

const CURSOR_KEY = "pt-track:cursor";
const HIST_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_MONTHS = 24;

async function getDailyCloses(ticker: string): Promise<PricePoint[] | null> {
  const key = `pt:hist:${ticker.toUpperCase()}`;
  const cached = await readServerCache<PricePoint[]>(key, HIST_TTL_MS);
  if (cached.value && !cached.stale) return cached.value;
  const res = await withFmpFeature("pt_track", () => marketData.getPriceHistory(ticker));
  const points = res.data?.points;
  if (!points || points.length === 0) return cached.value ?? null;
  const clean: PricePoint[] = points
    .filter((p) => p.date && Number.isFinite(p.close))
    .map((p) => ({ date: String(p.date).slice(0, 10), close: Number(p.close) }));
  await writeServerCache(key, clean);
  return clean;
}

export async function runPtTrackRecords(opts: { sliceSize?: number; nowMs?: number } = {}): Promise<{ people: number; computed: number; wrapped: boolean }> {
  const db = serviceClient();
  if (!db) return { people: 0, computed: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 20;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoff = new Date(nowMs - LOOKBACK_MONTHS * 30 * 86_400_000).toISOString().slice(0, 10);

  // People who have at least one congressional/insider record — the directory
  // ids in stable order for the cursor.
  const { data: peopleRows } = await db
    .from("power_people")
    .select("id")
    .order("id", { ascending: true })
    .limit(50_000);
  const people = (peopleRows ?? []).map((r: any) => String(r.id));
  if (people.length === 0) return { people: 0, computed: 0, wrapped: true };

  const cur = (await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER)).value ?? { i: 0 };
  const start = cur.i % people.length;
  const slice = people.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= people.length;

  const spy = (await getDailyCloses("SPY")) ?? [];
  let computed = 0;
  for (const personId of slice) {
    const { data: trades } = await db
      .from("power_trade_records")
      .select("ticker,disclosure_date,transaction_type")
      .eq("person_id", personId)
      .eq("transaction_type", "buy")
      .not("ticker", "is", null)
      .not("disclosure_date", "is", null)
      .gte("disclosure_date", cutoff)
      .limit(2_000);
    const buys: DisclosedBuy[] = (trades ?? [])
      .map((t: any) => ({ ticker: String(t.ticker).toUpperCase(), disclosureDate: String(t.disclosure_date).slice(0, 10) }))
      .filter((b: DisclosedBuy) => b.ticker && b.disclosureDate);
    if (buys.length === 0) continue;

    // Price each distinct ticker once (cached across people & the pt-returns job).
    const tickers = Array.from(new Set(buys.map((b) => b.ticker)));
    const pricesByTicker: Record<string, PricePoint[]> = {};
    for (const tk of tickers) {
      const closes = await getDailyCloses(tk);
      if (closes) pricesByTicker[tk] = closes;
    }

    const stats = computeTrackRecord(buys, pricesByTicker, spy);
    const rows = stats.map((s) => ({
      person_id: personId,
      window_days: s.window,
      n: s.n,
      mean_excess_pct: s.meanExcessPct,
      median_excess_pct: s.medianExcessPct,
      win_rate_pct: s.winRatePct,
      excesses: s.excesses,
      computed_at: new Date(nowMs).toISOString(),
    }));
    await db.from("power_track_records").upsert(rows, { onConflict: "person_id,window_days" });
    computed++;
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize });
  return { people: people.length, computed, wrapped };
}
