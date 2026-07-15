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

## Cost controls, continued

- **A3 chat-history discipline** (`lib/chat/history.ts`): each turn applies a
  sliding window (last 8 turns), stubs tool-result blobs older than the last 2
  turns (`[tool result: 14 rows]`), and enforces a per-plan token cap (free 6k /
  premium 16k / pro 32k), trimming oldest first — never the system block (cached).
- **A5 Batch API** (`lib/ai/batch.ts` + the `batch-collect` cron, every 15m):
  submit/collect for Anthropic Message Batches (~50% token discount on latency-
  insensitive work). The mechanism + collect loop ship now; each heavy generator
  opts in by calling `submitBatch()` and reading `ai:batch-results:<ns>` — a
  failed/expired batch falls back to real-time on the next scheduled run. (Most
  of this app's nightly work is already cached lazily-on-read, so the batch
  consumers to wire are the digest narration blocks + any future bulk pre-warm.)
- **A7 budgets + degradation ladder** (`lib/ai/budget.ts`): generous per-feature
  daily token ceilings; at 80% warn, at 100% the feature degrades per its step
  (narration → templates, enrichment → serve-stale, digest → skip, chat →
  economy — never fully off). A per-user anomaly guard flags any user over 3× the
  fleet p95. Pure + tested (`tests/ai-budget.test.ts`).
