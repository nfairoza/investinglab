# Backlog

Tracked follow-ups. Add new items here rather than leaving TODOs in code.

## Open (actionable in-repo)

- **Quiver Power Trades adapter** — `lib/power-trades/stubs.ts` (`quiverStub`) is a
  not-built stub. Verify Quiver's API terms + endpoints/fields against their docs
  before implementing. (The FMP congress + SEC Form 4 + executive + FEC/OpenSecrets
  adapters are all live; Quiver is an additional optional source.)

- **Legacy money-insights consolidation (optional refactor)** — `lib/money/insights.ts`
  (category anomalies / bill changes / income changes) predates the Insights Engine
  (`lib/insights/**`) and still backs `/api/money/analysis`, `/api/money/insights`,
  and `components/money-insights.tsx`. Folding it into the engine is a no-user-facing-
  change refactor; left as-is to respect zero-feature-loss (the two run in parallel
  harmlessly). Do it only if a single insight source becomes worth the churn.

## Blocked on external setup (code ready)

- **CI workflow** — `.github/workflows/ci.yml` is prepared on disk but the current
  OAuth token lacks the GitHub `workflow` scope to push it. Commit it with a PAT that
  has `workflow` scope, or add it via the GitHub UI. It runs
  `typecheck -> lint -> test -> build` on push/PR to `authbranch` and `main`.

- **Digest email delivery (F2)** — the Resend integration is built and degrades to
  in-app-only. Set `RESEND_API_KEY` (+ optional `DIGEST_FROM`, `NEXT_PUBLIC_APP_URL`)
  in Vercel to turn on actual email sending.

- **Push notifications (F1/F2)** — in-app notifications ship today. Web push delivery
  is gated on MOBILE_APP M1.2 landing the `push_subscriptions` table + service worker;
  wire push into the notification + digest paths when it does.

## Done (kept for provenance)

- **Research report persistence** — DONE. Memos persist in `shared_research` (shared,
  8am-ET / 12h staleness via `isDailyStale`); GET generates+caches on miss, POST is an
  admin force-refresh. (The old "no DB yet" comments were stale and have been removed.)
- **F3 earnings-reminder alert** — DONE. The `earnings` alert type (withinDays) is wired
  end-to-end: create UI, payload, and evaluation (`lib/alerts/evaluate.ts`).
- **P0–P5 production hardening** — DONE (SWR fetchJson migration, zod request validation,
  rate limiting, headers/error hygiene, per-endpoint FMP cache TTLs + batch quotes +
  provider-health strip, Card/Skeleton design foundation, advisor engine).
- **P6 Rukmani** — DONE, superseded by the Chat Upgrade (`CHAT:` commits): true agentic
  tool-use loop (role-gated user/admin tools, RLS-scoped), streaming + tool-status,
  chat memory, daily market brief. Gemini fallback is tool-less by design (Claude-first).
- **Insights Engine (all 4 stages)**, **Features V2 (F1–F8)**, **art/motion pass** — DONE.

## Notes

- `app/api/portfolio-doctor/route.ts` contains "TODO" only inside an AI prompt
  instruction ("never use placeholders … 'TODO'"). Not an actionable code TODO.
