# Capacity & limits

What bounds rukMoney at scale, and where the knobs are. Numbers reflect the code
as built; update this doc when a limit or TTL changes.

## External API quotas (the real ceilings)

| Provider | Limit | How we stay under it |
|---|---|---|
| **FMP (market data)** | Plan-dependent (free ≈ 250 calls/day; per-minute burst caps) | Per-endpoint cache TTLs + durable L2 + in-flight dedup + batch quotes + probe-and-remember for plan-restricted endpoints (batch-quote, intraday, hourly). See `lib/providers/fmp.ts`, `lib/providers/intraday.ts`. |
| **Plaid** | Per-item + billing-plan limits | Snapshot-first reads (`plaid_snapshot`, 6h TTL) so pages don't hit Plaid live; background refresh only when stale. See `lib/plaid-snapshot.ts`, `/api/plaid/*`, `computeNetWorth`. |
| **Anthropic / Google (AI)** | Token + RPM caps per key | Task router, shared prediction cache (6h, market-only), per-user AI cache (24h), per-user rate limiting on chat. Cost logged to `ai_usage`. |

## Cron & the Stock Map build (scheduler-agnostic)

One dispatcher — `GET /api/cron/tick` (CRON_SECRET bearer / `?key=` / Vercel's
`x-vercel-cron`). Any external trigger works; each job runs on its own cadence.

- **Trigger it** every ~5 min. On **Vercel Hobby** (daily-only crons) use an
  external scheduler (cron-job.org / GitHub Actions) hitting
  `/api/cron/tick?key=<CRON_SECRET>`. `vercel.json` also registers a daily tick
  as a Hobby-safe belt-and-suspenders backup.
- **Map build is chunked** (`buildMapChunk`) to stay under Hobby's **10s function
  cap** even on a per-symbol FMP plan: each tick prices a bounded slice (~120
  symbols) and advances a cursor in `server_cache`; the full S&P 500 fills in
  over a few ticks and refreshes continuously. On a **batch-capable** FMP plan a
  slice is one batch call, so the whole map builds in a single tick.
- Jobs: `map-refresh` (15m, market hours, 1D/quotes), `map-periods` (60m, adds
  5D/1M/6M/1Y for its slice), `map-eod` (12h, off-hours/weekend close). Cursors +
  last-run + locks live in `server_cache` so overlapping ticks can't double-run.
- **Watch:** the map's daily FMP consumption shows per-feature in the
  `/connectors` health strip (`byFeature.map`). Unpriced tiles render gray until
  their slice is reached — never fake zeros.

## Cache TTLs (in code)

- **FMP quotes** — 60s (memory-only; prices stay live).
- **FMP fundamentals / ratios / DCF / price-history** — 24h, durable L2 (`server_cache`) + stale-while-revalidate.
- **FMP profile** — 7d.
- **Intraday 15-min bars (1D charts)** — 5 min during market hours, 1h when closed.
- **Hourly bars (1M charts)** — 1h.
- **Plaid snapshots (balances / liabilities / investments)** — 6h.
- **Plan-restriction memos (batch-quote / intraday / hourly disabled)** — 24h.
- **Shared predictions** — 6h; **per-user AI cache** — 24h; research memos — 12h w/ 8am-ET reset.
- **In-memory maps** bounded to ~500 entries (oldest-first eviction).

## Rate limiting

Per-user sliding-window limiting via `lib/rate-limit.ts` (`guardAiRate`), backed by
the `rate_limits` table. Admins are exempt. Applied to AI endpoints (chat, etc.).

## Where state lives

- **Per-user data** — Supabase with row-level security (holdings, watchlists,
  transactions, prefs, snapshots). Scales with Supabase.
- **Shared/app caches** — `server_cache` (durable L1+L2), `shared_predictions`.
- **Secrets** — `app_secrets` (AES-256-GCM encrypted), Plaid token columns encrypted.
- **Diagnostics** — `error_log` (service-role only), `ai_usage` (cost tracking).

## Scaling notes / watch-items

- **FMP free tier is the first wall.** A handful of active users on the free plan
  can exhaust 250 calls/day. The caching layers make warm loads nearly free, but
  first-loads and rescans cost calls — upgrade the FMP plan before onboarding many
  users, or the provider-health strip (`/api/connectors/health`) will show rising
  error counts.
- **Serverless cold starts** drop the in-memory L1 cache; the durable L2 + Plaid
  snapshots absorb this so cold instances don't stampede the providers.
- **AI cost** is the main variable spend — watch the `ai_usage` admin card.
- **Admin-gated rescans** (predictions, opportunities, portfolio doctor) are the
  most expensive operations; they're intentionally not user-triggerable.

## Quick health checks

- `/api/connectors/health` — FMP last success/error + today's call count (admin).
- Admin → Errors — `error_log` rows (e.g. `dashboard-day-change` warnings,
  plan-restriction events).
- Admin → AI usage — token/cost tracking.
