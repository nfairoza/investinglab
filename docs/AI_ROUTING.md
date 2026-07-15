# AI routing table (AIOPT A8)

The canonical map of every AI-consuming feature → task type → primary/fallback
model → cache policy → batch eligibility → budget → degradation step. The
regression guard (`tests/ai-route-guard.test.ts`) asserts that every `routeText`
call passes an explicit `task` and `feature`, and that every `feature` used in
the codebase appears in the `FEATURES` list this doc mirrors. Adding a new AI
feature without a row here fails the build.

## How routing works

`planRoute(task, strategy)` in `lib/ai/router.ts` picks the primary provider +
model per `(task, strategy)`; the router then fails over to the other provider on
error (AIOPT A6). Strategy is `smart` (default) / `quality` / `economy`, set by
the admin AI-strategy knob. Tasks:

| Task | Smart primary | Model (smart) | Fallback |
|---|---|---|---|
| `deep-analysis` | Claude | Opus 4.8 | Gemini Pro |
| `chat-analysis` | Claude | Sonnet | Gemini Pro |
| `structured` | Gemini | Gemini Pro (JSON) | Claude Sonnet |
| `chat-casual` | Gemini | Flash | Claude Haiku |
| `light` | Gemini | Flash | Claude Haiku |

Chat additionally classifies each turn (AIOPT A1, `lib/ai/intent.ts`) into
`chat-casual` vs `chat-analysis` — a casual/navigation/teaching question never
pays the analysis tier.

## Per-feature table

| Feature | Task | Cache policy | Batch? | Notes |
|---|---|---|---|---|
| `chat` | chat-casual / chat-analysis (per-turn) | Anthropic prompt cache on system+tools (A2); per-user rate guard | No (interactive) | Failover Claude↔Gemini; intent-classified |
| `intent` | (heuristic) | none — zero tokens for obvious cases | No | Micro-classifier only for ambiguous turns |
| `research` | deep-analysis | shared_research (12h / 8am-ET) | Eligible | Admin force-refresh |
| `predict` | deep-analysis | shared_prediction (2h, market-only) | Eligible | — |
| `doctor` | deep-analysis + structured | daily server_cache (24h) | Eligible | Portfolio/Accounts Doctor |
| `opportunities` | deep-analysis | daily server_cache | Eligible | Admin rescan |
| `congress-alpha` | deep-analysis | server_cache L2 + L1 map | Eligible | — |
| `advisor` | chat-analysis | computed GET (no tokens) + narration cache | No | Narration only |
| `money-analysis` | chat-analysis | daily server_cache (money_doctor) | Eligible | — |
| `insights-narration` | light | narration cached on read; template fallback | **Yes** (nightly) | Numbers are deterministic; LLM narrates only |
| `enrich` | light | durable watchlist cache + staleness gate | **Yes** (nightly refresh) | — |
| `watchlist-recs` | light | per-user AI cache | Eligible | — |
| `alerts-suggest` | light | per-user cache + admin/daily gate | Eligible | — |
| `screener-ranking` | structured | server_cache | Eligible | Forced JSON schema |
| `market-brief` | light | daily server_cache (global) | Yes | Cron-built |

## Cost controls (cross-cutting)

- **A2 prompt caching**: chat sends `cache_control: {type:"ephemeral"}` on the
  static system block + tool definitions; cached input bills ~10% of base. Cache
  read tokens are logged (`ai_usage.cached_input_tokens`) → admin cache hit-rate.
- **A4 max_tokens**: right-sized per task (casual ≈ 400, enrich ≈ 700, narration
  ≈ 150 slots-only, memos higher). JSON calls use a forced schema, not "respond
  in JSON" prose, to avoid retry-on-parse double-spend.
- **Degradation ladder** (when a feature's budget is exhausted): narration →
  templates; enrichment → serve stale with age chip; digest AI block → skip;
  chat → economy models + tighter rate limit (never fully off).

## Deferred (tracked, not yet built)

- **A3** chat-history summarization (sliding window + rolling summary + tool-
  result stubs) — chat currently sends the last 12 turns verbatim.
- **A5** Batch API submission/collection for the "Batch? = Yes/Eligible" rows
  (~50% token discount on latency-insensitive cron generation).
- **A7** per-feature daily token budgets + anomaly guard + admin projected-spend.

These are safe to defer: caching (A2) + right-sizing (A4) + failover (A6) capture
the largest wins; the deferred items are incremental savings on top.
