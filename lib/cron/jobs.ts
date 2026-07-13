import type { CronJob } from "./registry";
import { buildMap, buildMapChunk } from "@/lib/market/map-build";
import { runAlerts } from "@/lib/alerts/run";
import { runAlertEscalation } from "@/lib/alerts/escalate";
import { runInsightsBuild } from "@/lib/insights/run";
import { detectFollowFilings } from "@/lib/follows/detect";
import { runWeeklyDigest } from "@/lib/digest/run";
import { runRecurring } from "@/lib/recurring/run";
import { buildMarketBrief } from "@/lib/chat/market-brief";
import { runLookthroughBuild } from "@/lib/lookthrough/run";
import { runPtReturns } from "@/lib/power-trades/returns-run";

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
  {
    // ALERTDEL AD3 — missed-push escalation. Every 5 min (any time — a missed push
    // is worth chasing off-hours too), batch any severity-1 deliveries that have
    // been unseen for 2h+ into ONE "you may have missed" email per user. Idempotent
    // and toggle-gated. Not market-hours-gated: escalation is about the user, not
    // the tape.
    id: "alert-escalate",
    everyMinutes: 5,
    run: async () => { const r = await runAlertEscalation(); return { ok: true, note: `${r.emailed} emailed / ${r.users} users (${r.candidates} candidates)` }; },
  },
  {
    // Insights Engine ("The Confidant") nightly build. Rebuilds the per-user
    // Ledger from Plaid data + regenerates structured insights. Chunked over the
    // user list (cursor in server_cache) so it stays under the Hobby 10s cap; the
    // ~daily cadence covers the whole base well within a day. No market gating.
    id: "insights-build",
    everyMinutes: 24 * 60,
    run: async () => { const r = await runInsightsBuild({ sliceSize: 40 }); return { ok: true, note: `${r.ledgersBuilt} ledgers, ${r.insightsCreated} insights / ${r.users} users${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // F6: recurring-charge detection over stored transactions. Nightly; notifies
    // on a newly detected charge or a price increase (dedupe prevents repeats).
    id: "recurring-detect",
    everyMinutes: 24 * 60,
    run: async () => { const r = await runRecurring(); return { ok: true, note: `${r.detected} charges / ${r.notified} notified, ${r.users} users` }; },
  },
  {
    // E3: ETF look-through exposure. For each user's holdings, fan every held ETF
    // into its constituent weights and compute per-symbol/per-sector exposure into
    // lookthrough_exposure. ETF constituents are globally cached (etf:const:SYM) so
    // an ETF is fetched at most once/day no matter how many users hold it. Chunked
    // over the user list (cursor in server_cache) for the Hobby 10s cap. Nightly.
    id: "lookthrough-build",
    everyMinutes: 24 * 60,
    run: async () => { const r = await runLookthroughBuild({ sliceSize: 25 }); return { ok: true, note: `${r.computed} computed / ${r.users} users${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // C6: refresh the global daily market brief so Rukmani's get_market_brief
    // tool can ground answers in today's tape. Twice a day is plenty.
    id: "market-brief",
    everyMinutes: 12 * 60,
    run: async () => { const b = await buildMarketBrief(); return { ok: true, note: `${b.indexes.length} indexes, ${b.headlines.length} headlines` }; },
  },
  {
    // PT1: signal-decay honesty. For each ticker on a tracked trade, fetch daily
    // history once (per-ticker global cache) and compute lag + since-trade/since-
    // disclosure returns for every trade on it into power_trade_returns. Chunked
    // by ticker cursor for the Hobby 10s cap; nightly cadence covers the universe.
    // Rows render from the table — the UI never computes returns on request.
    id: "pt-returns",
    everyMinutes: 24 * 60,
    run: async () => { const r = await runPtReturns({ sliceSize: 40 }); return { ok: true, note: `${r.rows} rows / ${r.priced} priced of ${r.tickers} tickers${r.wrapped ? " (full pass)" : ""}` }; },
  },
  {
    // F1: after Power Trades data refreshes, notify followers of new filings from
    // people they follow. Hourly is plenty (disclosures are daily-ish); dedupe on
    // (person, filing) means re-runs never double-notify.
    id: "follow-filings",
    everyMinutes: 60,
    run: async () => { const r = await detectFollowFilings(3); return { ok: true, note: `${r.notified} notified / ${r.filings} recent filings, ${r.follows} follows` }; },
  },
  {
    // F2: weekly digest. everyMinutes ~6d so it fires at most once/week; the run
    // itself self-gates to Sunday (ET) so it only actually assembles on Sundays.
    // (Vercel Hobby crons are daily-only; the tick dispatcher covers cadence.)
    id: "weekly-digest",
    everyMinutes: 6 * 24 * 60,
    run: async () => {
      // Gate to Sunday in US Eastern (digest rhythm).
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      if (et.getDay() !== 0) return { ok: true, note: "not sunday — skipped" };
      const r = await runWeeklyDigest();
      return { ok: true, note: `${r.emailed} emailed, ${r.inApp} in-app / ${r.eligible} eligible (${r.skippedEmpty} empty)` };
    },
  },
];
