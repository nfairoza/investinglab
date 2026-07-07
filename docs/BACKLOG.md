# Backlog

Tracked follow-ups extracted from in-code TODO/FIXME comments, so the source
stays clean. Add new items here rather than leaving TODOs in code.

## Open

- **Research report persistence** — `app/api/research/route.ts` notes that
  storing/reading `research_reports` is deferred to a later phase. Wire durable
  persistence when the `server_cache` table lands (spec Phase 1.3).

- **Quiver Power Trades adapter** — `lib/power-trades/stubs.ts` (`quiverStub`)
  is a not-built stub. Verify Quiver API terms + endpoints/fields against their
  docs before implementing.

## CI workflow (needs `workflow`-scoped token to commit)

`.github/workflows/ci.yml` is prepared on disk but couldn't be pushed by the
current OAuth token (missing GitHub `workflow` scope). Commit it manually with a
PAT that has `workflow` scope, or add it via the GitHub UI. It runs
`typecheck → lint → test → build` on push/PR to `authbranch` and `main`.

## Production hardening — remaining spec phases

Phases 0, 1, 2, and 5 of the hardening spec are done. Still open:

- **P0.2 remainder** — ~35 more SWR consumers still use inline fetchers that can
  hide errors. The core money/invest views are migrated; research/power-trades/
  admin/misc views remain (lower risk — most already show empty states).
- **P2 zod validation** — FOUNDATION DONE: zod installed + lib/validate
  (parseBody/parseQuery -> stable 400, zSymbol) with unit tests; applied to
  predict, watchlist enrich, watchlists create/rename, plaid transactions PATCH.
  STILL OPEN: sweep the remaining ~35 API routes and eliminate the ~113 `: any`
  usages. (Rate limiting + headers + error hygiene already done.)
- **P2 chat rate limit** — apply guardAiRate to the chat AI route (skipped to
  avoid a concurrent-edit conflict on app/api/chat/route.ts).
- **P3 FMP data quality** — DONE. Per-endpoint cache TTLs (quotes 60s /
  fundamentals 24h / profile 7d), batch quotes (fmpProvider.getQuotes +
  marketData.getQuotes + /api/quotes; wired into rankings, dashboard-data,
  watchlist), and a provider-health strip on /connectors. (Retry/backoff/
  429-cooldown/dedup already existed.)
- **P4 visual redesign** — FOUNDATION DONE: unified Card primitive (title +
  icon + DataResult freshness/source chips + footer) in components/ui/primitives,
  shimmer Skeleton (.skeleton), adopted in dashboard Watchlist / AI cost / Plaid
  holdings cards. Motion (--ease-out, card-hover 260ms), focus-visible rings,
  reduced-motion, and mobile touch/a11y already landed in prior phases (#111-115).
  STILL OPEN: migrate remaining dashboard/overview/money cards onto Card so every
  data surface shows a source+freshness chip; KPI hero rows using font-display;
  route any stray Recharts usage through chart-theme.ts.
- **P6 Rukmani** — P6.3 (ai_usage cost-tracking table + admin dashboard card)
  is DONE. Still open: P6.1 streaming chat responses (SSE/ReadableStream) and
  P6.2 server-side tool use (get_quote / get_portfolio_summary / get_watchlist).
  Both require rewriting app/api/chat/route.ts + the 709-line chat-widget.tsx —
  deferred while those files have concurrent (Cursor) edits, to avoid clobbering.

## Notes

- `app/api/portfolio-doctor/route.ts` contains the word "TODO" only inside an
  AI prompt instruction ("never use placeholders … 'TODO'"). Not an actionable
  code TODO — left as-is.
