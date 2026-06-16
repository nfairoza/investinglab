# StockPilot AI

A personal, beginner-friendly, **decision-support** investing dashboard: live market data, visual charts, a skeptical AI research memo, and prediction-market odds — built so it **teaches while it informs**.

> **This is research and educational analysis, not financial advice.**

---

## What's in this scaffold (and what isn't)

This repo is a **runnable foundation**, not the finished 9-phase app. It deliberately nails the three load-bearing patterns from the build spec so the rest can be layered on without rework:

1. **Swappable data providers.** All external data flows through one interface (`MarketDataProvider`). Change provider by editing **one file**: `lib/providers/index.ts`.
2. **Structural data honesty.** Every data point is wrapped in `DataResult<T>` carrying `source` (`live` / `demo` / `unavailable`), `asOf` (timestamp), and `provider`. A component *cannot* render a number without knowing whether it's live — so demo data can never masquerade as live, and failures degrade to a "Live data unavailable" badge instead of a fake value. See the contract at the top of `lib/providers/types.ts`.
3. **One glossary, two surfaces.** `lib/glossary.ts` is the single source of truth that powers both the hover/tap `<Term>` tooltips *and* the `/glossary` page. Add a term once; it shows up everywhere.

**Built now (Phase 1 + the Phase 2 data layer):**
- Next.js App Router + TypeScript + Tailwind, dark mode, sidebar nav across all 9 pages.
- Provider adapters: `fmp` (Financial Modeling Prep, real endpoints) + `demo` (clearly labeled), behind a common interface with a key-based selector.
- Server API routes `/api/quote` and `/api/financials` returning `DataResult` JSON.
- End-to-end honesty proof: the dashboard's `QuoteProbe` hits the live route and renders price + LIVE/DEMO badge + timestamp + up/down (color **and** arrow **and** word).
- Beginner layer: `<Term>` tooltips, a real `/glossary` page, and a "What should I look at first?" callout pattern.
- Supabase schema + RLS migration (`supabase/migrations/0001_init.sql`).

**Left for you to build in Claude Code / Cursor (it's iterative and needs a running server + real keys):**
- Supabase **auth wiring** (client + SSR/middleware). The schema and RLS are ready; the session plumbing is intentionally not half-shipped here.
- `shadcn/ui` init (the spec calls for it; this scaffold uses plain Tailwind so it runs with zero extra setup).
- **Phases 3–9:** reusable Recharts chart components, Holdings, Watchlist, the AI research engine (sections A–P + "Explain Like I'm New"), timing/alerts/Portfolio Doctor, prediction markets, and the aggregated dashboard.

The full original build spec defines all nine phases — keep building against it.

---

## Quick start

Requirements: **Node 18.17+** (Node 20 LTS recommended).

```bash
npm install
cp .env.example .env.local   # fill in what you have; leave the rest blank
npm run dev                  # http://localhost:3000
```

With **no API keys**, the app runs in demo mode: every data point shows a **DEMO** badge. Nothing is faked as live. Add a market-data key (see below) and the same components start showing **LIVE** data with timestamps — no code change needed.

Type-check without building:

```bash
npm run typecheck
```

---

## Environment variables

Copy `.env.example` to `.env.local`. Server-only keys (everything except `NEXT_PUBLIC_*`) are never exposed to the browser — all external calls happen in server routes.

| Var | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | links / callbacks | e.g. `http://localhost:3000` |
| `SUPABASE_URL` | auth + DB | from your Supabase project |
| `SUPABASE_ANON_KEY` | client auth | public-safe anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server writes (snapshots) | **server only — never client** |
| `MARKET_DATA_API_KEY` | live quotes/financials | the demo→live switch reads this |
| `FINANCIAL_DATA_API_KEY` | fundamentals | also flips on live mode |
| `NEWS_API_KEY` | news | Phase 6 |
| `AI_API_KEY` | research memo generation | Phase 6 |
| `SEC_API_KEY` | SEC EDGAR filings | optional |
| `PREDICTION_MARKET_API_KEY` | Polymarket / Kalshi | optional, Phase 8 |

The provider selector turns on live mode when `MARKET_DATA_API_KEY` **or** `FINANCIAL_DATA_API_KEY` is set; otherwise it uses the demo adapter.

---

## Swapping the data provider

The bundled live adapter targets **Financial Modeling Prep**. To switch to Polygon, Finnhub, Alpha Vantage, Twelve Data, etc.:

1. Create `lib/providers/<name>.ts` implementing the `MarketDataProvider` interface from `lib/providers/types.ts` (`getQuote`, `getFinancials`, `getNews`, `getEarningsDate`, `getTechnicals`). Each method must return a `DataResult<T>` and, on a missing key or failed call, return `unavailable(...)` — never throw a fake value.
2. Import it in `lib/providers/index.ts` and assign it to `marketData`.

Nothing else in the app changes — pages and routes only ever talk to the `marketData` interface. Use the `live()` / `demo()` / `unavailable()` helpers in `types.ts` so the honesty metadata is always set correctly.

---

## Database (Supabase)

The schema + Row Level Security live in `supabase/migrations/0001_init.sql`.

```bash
# with the Supabase CLI linked to your project:
supabase db push
# or paste the file into the Supabase SQL editor and run it.
```

Tables: `profiles`, `holdings`, `watchlist`, `research_reports`, `alerts`, `portfolio_notes`, `stock_snapshots`, `prediction_markets`, `prediction_snapshots`. RLS is on for every table; users can only touch their own rows (`auth.uid() = user_id`). `stock_snapshots` is server-write-only (RLS on, no public policy) and a trigger auto-creates a `profiles` row on signup.

---

## Project layout

```
app/                     # App Router pages (9) + API routes
  api/quote/route.ts     #   live quote  -> DataResult JSON
  api/financials/route.ts#   fundamentals -> DataResult JSON
  page.tsx               #   Dashboard (live-data check + Term + disclaimer)
  glossary/page.tsx      #   real Glossary, driven by lib/glossary.ts
  holdings|watchlist|research|portfolio-doctor|predictions|alerts|settings/
lib/
  providers/             # the data-honesty + swappable-adapter keystone
    types.ts             #   DataResult<T>, domain types, MarketDataProvider
    fmp.ts demo.ts       #   adapters
    index.ts             #   <-- swap providers here
  glossary.ts            # single source of truth for terms (tooltips + page)
components/
  data-state.tsx         # DataBadge + DataTimestamp (color + words)
  term.tsx               # <Term> tooltip (hover / tap / focus)
  quote-probe.tsx        # end-to-end live/demo proof on the dashboard
  sidebar.tsx page-shell.tsx
supabase/migrations/0001_init.sql
```

---

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add every env var from the table above in **Project → Settings → Environment Variables** (keep service-role and provider keys server-side — do not prefix them with `NEXT_PUBLIC_`).
3. Deploy. Point `NEXT_PUBLIC_APP_URL` at the deployed URL and add that URL to Supabase Auth redirect settings once you wire auth.

---

## The honesty rails (baked in on purpose)

This scaffold keeps the **app's** guardrails — timestamps on every figure, DEMO/unavailable badges, no fake precision, color-plus-words, and the "not financial advice" disclaimer. It does **not** hardcode any buy/sell calls: recommendations are meant to come from real data plus the AI research route, always paired with a confidence level and the single biggest risk, exactly as the spec requires. Build the analytical phases to *interpret* data skeptically — never to manufacture certainty a pretty chart might imply.
