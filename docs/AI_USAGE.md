# AI usage & token-cost tiers

rukMoney routes every AI call to the cheapest model that can do the job well. The
router lives in [`lib/ai/router.ts`](../lib/ai/router.ts); each call passes a
`task` that maps to a model tier. Cross-provider fallback (Claude ↔ Gemini) is
automatic on failure.

## Tiers

| Tier | `task` value | Model (Smart strategy) | Why |
|---|---|---|---|
| **Light** | `light`, `chat-casual` | Claude **Haiku** / Gemini **Flash** | Short lists, labels, navigation/teaching chat — no deep reasoning. |
| **Medium** | `structured`, `chat-analysis` | Gemini **Pro** / Claude **Sonnet** | Reliable JSON extraction, big-context, data-backed chat reasoning. |
| **Heavy** | `deep-analysis` | Claude **Opus 4.8** (Gemini Pro fallback) | Multi-step financial reasoning where accuracy matters most. |

The **Routing strategy** setting (Settings → AI) shifts the leans:
- **Smart (auto)** — the table above. Default.
- **Economy** — cheap everywhere; only `deep-analysis` escalates to Opus.
- **Quality** — strongest model for real analysis, but light tasks stay cheap (no point paying Opus to emit a 5-item list).

## Endpoint → tier map

### Heavy (`deep-analysis` — Opus)
These do genuine multi-step reasoning and/or web research. Most are cached and/or admin-gated to control spend.

| Endpoint / module | What it does | Cost controls |
|---|---|---|
| [`/api/predict`](../app/api/predict/route.ts) | Up/down/flat probabilistic call w/ confidence | shared cache, admin-only rescan |
| [`/api/portfolio-doctor`](../app/api/portfolio-doctor/route.ts) | Whole-portfolio health analysis | daily cache, admin-only rerun |
| [`/api/research`](../app/api/research/route.ts) | Skeptical research memo (A–P sections) | global 12h cache, admin-only refresh |
| [`/api/opportunities`](../app/api/opportunities/route.ts) | "Where to put your cash" plan | 6h cache, admin-only rescan |
| [`/api/congress/alpha`](../app/api/congress/alpha/route.ts) | Power Trades conviction thesis | 12h cache |

### Medium (`structured` / `chat-analysis`)
| Endpoint / module | Tier | What it does |
|---|---|---|
| [`/api/portfolio-doctor`](../app/api/portfolio-doctor/route.ts) (2nd pass) | `structured` | Structures the analysis into strict JSON |
| [`lib/screener/ranking.ts`](../lib/screener/ranking.ts) | `structured` | Daily AI ranking of preset lists |
| [`/api/advisor`](../app/api/advisor/route.ts) | `chat-analysis` | Narrates the order-of-operations plan |
| [`/api/money/analysis`](../app/api/money/analysis/route.ts) | `chat-analysis` | Spending / money-picture analysis |
| [`/api/chat`](../app/api/chat/route.ts) | `chat-analysis` | Chat turns classified as analysis (buy/sell/valuation/why) |

### Light (`light` / `chat-casual`)
| Endpoint / module | Tier | What it does |
|---|---|---|
| [`/api/watchlist-recs`](../app/api/watchlist-recs/route.ts) | `light` | "You might like" short list (24h cache) |
| [`/api/alerts/suggest`](../app/api/alerts/suggest/route.ts) | `light` | Suggested alerts short list |
| [`/api/chat`](../app/api/chat/route.ts) | `chat-casual` | Chat turns classified as navigation/teaching/small-talk |

## How chat picks its tier
[`/api/chat`](../app/api/chat/route.ts) classifies each user message in
`classifyChat()`: questions about buy/sell/valuation/why/compare/risk →
`chat-analysis` (medium); navigation/"how do I"/"what does this page do"/glossary
→ `chat-casual` (light). Images force `chat-analysis` (vision needs a capable
model). So a single chat thread mixes cheap and strong models per question.

## Adding a new AI feature
1. Pick the **cheapest tier that still answers well** — default to `light`, only
   reach for `deep-analysis` if it genuinely needs multi-step reasoning.
2. Cache the result if it isn't per-keystroke (see the heavy endpoints for the
   pattern), and gate expensive regeneration behind admin where users only need
   a periodically-refreshed view.
3. Add the endpoint to the map above.
