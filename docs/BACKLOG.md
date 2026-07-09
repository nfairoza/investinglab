# Backlog

Tracked follow-ups extracted from in-code TODO/FIXME comments, so the source
stays clean. Add new items here rather than leaving TODOs in code.

## Open

- **Research report persistence** — `app/api/research/route.ts` notes that
  storing/reading `research_reports` is deferred to a later phase. The
  `server_cache` table it was waiting on has since landed, so this is now
  unblocked and ready to implement.

- **Features V2 tails** — F1–F8 shipped. Remaining: push delivery (blocked on
  MOBILE_APP M1.2 / `push_subscriptions`); live digest email (needs
  `RESEND_API_KEY` — degrades to in-app-only without it); optional F3
  earnings-reminder alert type (spec marked optional).

- **Insights Engine cleanup** — consolidate the legacy `lib/money/insights.ts`
  rules into the Insights Engine (they run in parallel harmlessly today; a
  refactor with no user-facing change).

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

- **P0.2 remainder** — DONE: ~20 more SWR read-fetchers migrated to the throwing
  fetchJson (full-page views also got visible ErrorState). Envelope-pattern
  (DataResult) and mutation/search fetchers intentionally left as-is.
- **P2 zod validation** — DONE for request validation: zod + lib/validate
  (parseBody/parseQuery, zSymbol) with unit tests, applied to every input route
  EXCEPT power-trades/manual-record (delegates validation to its lib); chat is
  now validated too. `: any` cleanup: DONE — 114 -> 28 (~22 intentionally kept
  for genuinely-dynamic external JSON where a wrong type is worse than any).
  Rate limiting + headers + error hygiene done. Phase 2 is effectively complete.
- **P2 chat rate limit** — DONE (guardAiRate on /api/chat, admins exempt).
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
  Card grammar now adopted across money-insights, money-dashboard, accounts-
  doctor, congress-alpha-feed, watchlist-recs, source-coverage (+ the earlier
  watchlist/AI-cost/plaid-holdings cards). Remaining bespoke cards were left
  intentionally (complex headers with tabs/toolbars/refs where Card would be
  lossy — e.g. opportunities-card, market-outlook, the accounts-doctor headline).
  Phase 4 is effectively complete; any further card migration is optional polish.
- **P6 Rukmani** — DONE, superseded by the Chat Upgrade (commits `CHAT:`).
  P6.1 streaming + P6.3 cost tracking done. P6.2 TRUE function-calling is now
  SHIPPED: `app/api/chat/route.ts` runs a real agentic tool loop (model ->
  tool_use -> server execute -> tool_result -> model, max 5 iters) on the Claude
  path, with role-gated user/admin tools in `lib/chat/tools.ts` (RLS-scoped),
  memory (chat_memory), a daily market brief, and tool-status streaming. The
  Gemini fallback stays tool-less by design (Claude-first). Keyword context-
  stuffing was removed.

## Notes

- `app/api/portfolio-doctor/route.ts` contains the word "TODO" only inside an
  AI prompt instruction ("never use placeholders … 'TODO'"). Not an actionable
  code TODO — left as-is.
