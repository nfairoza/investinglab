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

## Notes

- `app/api/portfolio-doctor/route.ts` contains the word "TODO" only inside an
  AI prompt instruction ("never use placeholders … 'TODO'"). Not an actionable
  code TODO — left as-is.
