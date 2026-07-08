import type { CronJob } from "./registry";
import { buildMap, buildMapChunk } from "@/lib/market/map-build";
import { runAlerts } from "@/lib/alerts/run";

// The job registry. Each job owns its cadence; the dispatcher (/api/cron/tick)
// runs whatever is due on each tick, so ANY external trigger interval works.
//
// Cadence rationale (from the map spec):
//   - map-refresh: every 15 min during market hours. A build is a handful of
//     calls on a batch-capable plan, or pooled per-symbol otherwise. This is a
//     "fast" build (quotes/1D + reuse prior period data).
//   - map-periods: every 60 min (any time) — refreshes the slow period returns
//     (5D/1M/6M/1Y) via a "full" build. They barely move intraday, so hourly is
//     plenty and keeps quote headroom for the rest of the app.
//   - map-eod: once every ~12h so off-hours/weekends still have a fresh-ish close
//     to serve (labeled by asOf in the UI).
export const JOBS: CronJob[] = [
  {
    // Prices a bounded slice per tick (cursor advances), so it stays under
    // Vercel Hobby's 10s function cap even on a per-symbol FMP plan. On a
    // batch-capable plan the slice is one batch call and the whole map fills in
    // a single tick. During market hours the map fully refreshes every few ticks.
    id: "map-refresh",
    everyMinutes: 15,
    marketHoursOnly: true,
    run: async () => { const r = await buildMapChunk({ sliceSize: 120 }); return { ok: true, note: `+${r.pricedThisRun} priced, ${r.pricedCount}/${r.totalCount} total${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // Slower cadence pass that also refreshes the period returns (5D/1M/6M/1Y)
    // for its slice — they barely move intraday, so hourly is plenty.
    id: "map-periods",
    everyMinutes: 60,
    run: async () => { const r = await buildMapChunk({ sliceSize: 120, withPeriods: true }); return { ok: true, note: `periods +${r.pricedThisRun}, ${r.pricedCount}/${r.totalCount}${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // End-of-day / off-hours pass so weekends serve a fresh-ish close. Chunked
    // + withPeriods so it also stays under the Hobby cap; over its 12h cadence
    // the cursor covers the whole universe. (buildMap kept as the one-shot path
    // for batch-capable plans / manual rebuilds.)
    id: "map-eod",
    everyMinutes: 12 * 60,
    run: async () => { const r = await buildMapChunk({ sliceSize: 200, withPeriods: true }); return { ok: true, note: `eod +${r.pricedThisRun}, ${r.pricedCount}/${r.totalCount}${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // Server-side alert evaluation so price/dayMove alerts fire even when the app
    // is closed. One batch quote covers every user's symbols; triggers are
    // written back to the alert row (the feed the client already reads).
    id: "alerts-evaluate",
    everyMinutes: 5,
    marketHoursOnly: true,
    run: async () => { const r = await runAlerts(); return { ok: true, note: `${r.triggered} fired / ${r.evaluated} evaluated (${r.symbols} syms, ${r.pruned} pruned)` }; },
  },
];
