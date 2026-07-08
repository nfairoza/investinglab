import type { CronJob } from "./registry";
import { buildMap } from "@/lib/market/map-build";

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
    id: "map-refresh",
    everyMinutes: 15,
    marketHoursOnly: true,
    run: async () => { const b = await buildMap("fast"); return { ok: true, note: `${b.pricedCount}/${b.totalCount} priced` }; },
  },
  {
    id: "map-periods",
    everyMinutes: 60,
    run: async () => { const b = await buildMap("full"); return { ok: true, note: `full build, ${b.pricedCount}/${b.totalCount} priced` }; },
  },
  {
    id: "map-eod",
    everyMinutes: 12 * 60,
    run: async () => { const b = await buildMap("full"); return { ok: true, note: `eod build, ${b.pricedCount}/${b.totalCount} priced` }; },
  },
];
