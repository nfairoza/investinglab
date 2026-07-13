# Caching & staleness ruler

> **Governing rule:** staleness is allowed, *hiding* it never is. Any cached
> surface shows its `asOf`. Any cached AI conclusion that depends on a live price
> is re-derived against the live quote at read time — the expensive *thinking* is
> cached, the price-sensitive *verdict* never is.

This table is the canonical reference. Every cache decision in the codebase should
map to a row here. If a new surface doesn't fit, add a row **with justification**
rather than inventing an ad-hoc TTL in one route.

## Before adding any new cached surface

1. **Pick a row below** (or add one, justifying the max-staleness you chose).
2. **Carry `asOf`** (or `generatedAt`) in the `DataResult` / payload, and render it
   in the UI. A cached number with no visible timestamp is a lie by omission.
3. **Never serve a price-comparison conclusion older than the quote it compares
   against.** If a cached AI verdict says "below your ideal entry", that must be
   true against the *current* live price, not the price when the analysis ran.
   Cache the analysis; recompute the verdict live (see `lib/watchlist/verdict.ts`).
4. **If the route calls a model, it must cache or rate-guard** — enforced by
   `tests/ai-route-guard.test.ts`. A new unguarded AI route fails the build.

## The ruler

| Data | Max staleness | Mechanism |
|---|---|---|
| Live quotes / day change | 60s | FMP L1 cache |
| Intraday charts, stock map tiles | 5–15 min | cron build + `server_cache`, `asOf` chip |
| AI analysis / memos / enrichments | 24h | shared `server_cache`, daily-stale; **price-dependent verdicts re-derived live at read** |
| Financial statements / ratios / DCF | 24h | FMP L2 durable |
| Company profiles | 7d | FMP L2 durable |
| Congress / insider signal payloads | 12h | `server_cache` (source itself lags weeks) |
| User Plaid balances / liabilities | 6h snapshot | `plaid_snapshot` + manual refresh + background sync |
| News / market brief | rebuilt daily + on-demand tool | `server_cache` |

## Mechanisms, concretely

- **FMP L1 / L2** — `lib/providers/fmp.ts`: L1 in-memory (per instance) + L2 durable
  `server_cache` with stale-while-revalidate. Per-endpoint TTLs.
- **`server_cache`** — `lib/server-cache.ts`: `readServerCache` / `writeServerCache`,
  two-layer (memory + DB), freshness via `isDailyStale` (`lib/daily-cache.ts`:
  stale past the most recent 8am-ET boundary OR older than `maxAgeMs`, default 12h).
- **Shared AI analysis** — global-per-symbol keys like `shared:enrich:{SYM}` and the
  `shared_research` table. First requester generates; everyone else reuses the day's
  result. Price-sensitive parts recomputed live.
- **Per-user AI cache** — `readAiCache` / `writeAiCache` (`user_prefs.ai_cache`, TTL
  per feature) for personal analyses (money analysis, watchlist recs, alert
  suggestions).
- **Rate guard** — `guardAiRate` (`lib/rate-limit.ts`): 20 AI calls / 5 min / user,
  admins exempt. Wraps the token-spending path of any AI route that can be triggered
  repeatedly (e.g. the enrich Re-analyze force-refresh).
- **Per-feature cost attribution** — every `ai_usage` row carries a `feature` label
  (`lib/ai/usage.ts`, migration 0033); the /admin cost card groups spend by feature,
  so a token leak in one surface shows as a line item, not a mystery total.

## Who may trigger AI generation

> **Policy: users CONSUME AI output; only schedules, staleness, and admins TRIGGER
> generation.** There is no user-facing button that spends AI tokens on demand.

An AI call costs money and latency, so a "Regenerate / Re-analyze / Refresh / Re-scan"
button that any user can mash is a token leak and a DoS foot-gun. Every AI route
therefore falls into one of two shapes:

1. **Shared, cron-or-staleness fed** (research memo, watchlist enrichment, predictions,
   opportunities, congress alpha). The output is the same for everyone, cached
   globally/daily, and refreshed automatically (staleness on read, or a cron). The
   manual **force-refresh is admin-only, enforced server-side**: a non-admin `refresh`/
   `force` is rejected `403` (not silently downgraded), and the button is hidden in the
   UI. Users get the auto-refreshed cache. Examples:
   `app/api/watchlist/enrich` (`decideEnrich`, 403 + `tests/enrich-policy.test.ts`),
   `research` (admin 403), `predict` (admin 403 on force), `portfolio-doctor`/`advisor`
   (`force = … && ctx.isAdmin`), `opportunities`/`money/analysis` (cache-first + admin
   force), `congress/alpha` (admin-only `refresh=1`).

2. **Per-user, no cron** (Money Doctor, alert suggestions, opportunities first-run).
   These can't be admin-only — a user must be able to produce their own first result —
   so they are **cache-first + hard per-user/day rate-limited** server-side
   (`guardAiRate(ctx, "<feature>-daily", N, 24h)`), on top of the standard burst guard.
   A fresh cache is served with zero token spend; only genuine staleness regenerates,
   and the daily cap backstops abuse.

**Rule for any NEW AI route:** it must be either (a) admin-gated on its force path with
a server-side `403`, or (b) hard per-user/day rate-limited — and always cache-first and
`feature`-labelled. A user-clickable control that regenerates AI output with neither is
a bug. `tests/ai-route-guard.test.ts` enforces cache-or-rate-guard at build time.

## Why the price-sensitivity rule exists

An AI verdict like "Buy now — below your ideal entry" is two things glued together:
expensive *reasoning* (fair-value range, bull/bear, catalyst) and a cheap *price
comparison* (is today's price below that range?). Caching the whole thing means that
by afternoon the "verdict" can contradict the live price the user is staring at —
the cache is honest about *staleness* but dishonest about the *conclusion*. So we
split them: cache the reasoning for 24h, recompute the price comparison against the
live quote on every read. See `deriveVerdict` in `lib/watchlist/verdict.ts` and its
tests in `tests/watchlist-verdict.test.ts` (the key assertion: the same cached
analysis yields opposite Buy/Avoid verdicts at different live prices).
