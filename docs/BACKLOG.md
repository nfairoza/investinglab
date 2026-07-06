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
- **P2 zod validation** — add `zod` and validate body/query in every API route;
  eliminate the ~113 `: any` usages. (Rate limiting + headers + error hygiene done.)
- **P2 chat rate limit** — apply guardAiRate to the chat AI route (skipped to
  avoid a concurrent-edit conflict on app/api/chat/route.ts).
- **P3 FMP batch quotes** — use FMP batch-quote endpoints where many symbols are
  requested (watchlist/screener/rankings); per-endpoint TTLs via server_cache;
  provider-health strip on /connectors. (Retry/backoff/429-cooldown/dedup already
  exist in lib/providers/fmp.ts.)
- **P4 visual redesign** — unified Card primitive with source+freshness chip,
  KPI hero rows, chart-theme routing, skeleton/empty/error polish, micro-
  interactions, mobile + a11y pass.
- **P6 Rukmani** — P6.3 (ai_usage cost-tracking table + admin dashboard card)
  is DONE. Still open: P6.1 streaming chat responses (SSE/ReadableStream) and
  P6.2 server-side tool use (get_quote / get_portfolio_summary / get_watchlist).
  Both require rewriting app/api/chat/route.ts + the 709-line chat-widget.tsx —
  deferred while those files have concurrent (Cursor) edits, to avoid clobbering.

## Notes

- `app/api/portfolio-doctor/route.ts` contains the word "TODO" only inside an
  AI prompt instruction ("never use placeholders … 'TODO'"). Not an actionable
  code TODO — left as-is.
