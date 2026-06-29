# rukMoney

A personal, beginner-friendly **decision-support** platform for your money: live market data and charts, a skeptical AI research engine, connected bank + brokerage accounts, net-worth and spending tracking, and prediction-market odds — built so it **teaches while it informs**.

> **This is research and educational analysis, not financial advice.**

---

## Information architecture

The app is organised into four sections (single source of truth: `lib/nav.ts`), surfaced by the desktop sidebar, the mobile bottom bar, and the Invest sub-nav. Account / Settings / Profile / Help / Admin live in the top-right account menu.

- **Overview** (`/`) — the aggregated landing view.
- **Invest** — `dashboard`, `holdings` (+ per-symbol `holdings/[symbol]`), `research`, `rankings`, `map` (Stock Map), `screeners` (+ `screeners/[key]`), `predictions`, `portfolio-doctor`, `power-trades`, `watchlist`, `journal`.
- **Money** — `money` (dashboard), `accounts`, `transactions`, `spending`, `accounts-doctor`.
- **Insights** — `advisor` (AI Advisor), `alerts`.
- **Admin-only** — `admin` (portal), `admin/errors` (error log), `connectors` (API keys & provider config). Gated server-side; hidden from regular users.

Auth & account pages: `login`, `signup`, `forgot-password`, `reset-password`, `profile`, `settings`, `help`, `glossary`, plus `reports` and the `plaid/oauth` callback.

---

## The three load-bearing patterns

1. **Swappable data providers.** All external market data flows through one interface (`MarketDataProvider` in `lib/providers/types.ts`). Provider selection happens **per call** in `lib/providers/index.ts`, so a key added in the Connectors UI flips demo→live immediately. Congress trades have their own `CongressTradesProvider`.
2. **Structural data honesty.** Every data point is wrapped in `DataResult<T>` carrying `source` (`live` / `demo` / `unavailable`), `asOf` (timestamp), and `provider`. A component *cannot* render a number without knowing whether it's live — so demo data can never masquerade as live, and failures degrade to an "unavailable" state instead of a fake value. See the contract at the top of `lib/providers/types.ts`.
3. **One glossary, two surfaces.** `lib/glossary.ts` is the single source of truth that powers both the hover/tap `<Term>` tooltips *and* the `/glossary` page. Add a term once; it shows up everywhere.

---

## Features

- **Next.js 14 App Router + TypeScript + Tailwind**, dark mode, responsive (desktop sidebar + mobile tab bar), PWA install button.
- **Supabase auth is fully wired** — client, SSR/server, and middleware session refresh (`utils/supabase/*`, `middleware.ts`), with Row Level Security on every per-user table.
- **Market data:** quotes, financials, news, earnings dates, technicals, company profile, analyst data, insider trades, DCF, and price history via the `fmp` (Financial Modeling Prep) adapter, with a clearly-labelled `demo` adapter as fallback.
- **Stock research engine, rankings, Stock Map, and screeners** (with saved lists / presets).
- **Holdings, Watchlist(s), Journal, Alerts**, and a **Portfolio Doctor**.
- **Money side (Plaid):** linked bank/brokerage accounts, transactions with categorization, spending analysis, net-worth tracking + snapshots, manual items/liabilities, and an **Accounts Doctor**.
- **Brokerage sync (E\*TRADE):** read-only OAuth 1.0a positions/balances.
- **Power Trades:** congressional disclosure feed, plus (admin-gated, off by default) SEC Form 4 insider sync, curated executive 278-T entries, and FEC influence context.
- **AI throughout:** a task-aware router (`lib/ai/router.ts`) across **Anthropic (Claude Opus/Sonnet/Haiku)** and **Google Gemini (Pro/Flash)** powering the research memo, predictions, Portfolio Doctor, AI Advisor, Opportunities, and the Rukmani chat widget — with `smart` / `quality` / `economy` strategies and cost-control caching.
- **Beginner layer:** `<Term>` tooltips, the `/glossary` page, and contextual "what to look at first" guidance.
- **Admin tooling:** error log, connectors/keys management, and access guardrails (see [`GUARDRAILS.md`](GUARDRAILS.md)).
- **Reports:** PDF/spreadsheet export via `jspdf` / `xlsx`.

---

## Quick start

Requirements: **Node 18.17+** (Node 20 LTS recommended).

```bash
npm install
cp .env.example .env.local   # fill in what you have; leave the rest blank
npm run dev                  # http://localhost:3000
```

With **no API keys**, market views run in demo mode: every data point shows a **DEMO** badge — nothing is faked as live. Add a market-data key (in the Connectors UI or `.env.local`) and the same components start showing **LIVE** data with timestamps, no code change needed.

Type-check without building:

```bash
npm run typecheck
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.

---

## Environment variables

Copy `.env.example` to `.env.local`. Server-only keys (everything except `NEXT_PUBLIC_*`) are never exposed to the browser — all external calls happen in server routes. Most keys can also be set at runtime via the admin **Connectors** UI.

| Var | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | links / callbacks | e.g. `http://localhost:3000` |
| `MARKET_DATA_API_KEY` | live quotes / financials / congress | flips demo→live |
| `FINANCIAL_DATA_API_KEY` | fundamentals | also flips on live mode |
| `NEWS_API_KEY` | news | optional |
| `ANTHROPIC_API_KEY` / `AI_API_KEY` | Claude AI features | research memo, chat, doctors, advisor |
| `AI_MODEL` | default Claude model | e.g. `claude-sonnet-4-6` |
| `GEMINI_API_KEY` | Gemini AI features | big-context / structured tasks (see `lib/ai/gemini.ts`) |
| `ETRADE_CONSUMER_KEY` / `ETRADE_CONSUMER_SECRET` | E\*TRADE sync | read-only OAuth 1.0a |
| `ETRADE_SANDBOX` | E\*TRADE mode | `true` for sandbox keys |
| `SUPABASE_URL` | auth + DB | from your Supabase project |
| `SUPABASE_ANON_KEY` | client auth | public-safe anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server writes (snapshots) | **server only — never client** |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` | bank / brokerage linking | Money section |
| `CONGRESS_TRADES_API_KEY` / `CONGRESS_TRADES_API_BASE` | congress disclosures | optional override |
| `POWER_TRADES_ENABLE_SEC_FORM4` + `SEC_USER_AGENT` | SEC Form 4 sync | admin-only, off by default |
| `POWER_TRADES_ENABLE_EXECUTIVE` | executive 278-T entry | admin-only, off by default |
| `POWER_TRADES_ENABLE_FEC` + `FEC_API_KEY` | FEC influence context | admin-only, off by default |
| `SEC_API_KEY` | SEC EDGAR filings | optional |
| `PREDICTION_MARKET_API_KEY` | Polymarket / Kalshi | optional |

> Check `.env.example` for the authoritative, current list of keys.

The market-data provider turns on live mode when `MARKET_DATA_API_KEY` **or** `FINANCIAL_DATA_API_KEY` is set (via env or the Connectors UI); otherwise it uses the demo adapter. Congressional trades reuse the market-data key.

---

## Swapping the data provider

The bundled live adapter targets **Financial Modeling Prep**. To switch to Polygon, Finnhub, Alpha Vantage, Twelve Data, etc.:

1. Create `lib/providers/<name>.ts` implementing the `MarketDataProvider` interface from `lib/providers/types.ts` (`getQuote`, `getFinancials`, `getNews`, `getEarningsDate`, `getTechnicals`, `getCompanyProfile`, `getAnalystData`, `getInsiderTrades`, `getDcf`, `getPriceHistory`). Each method must return a `DataResult<T>` and, on a missing key or failed call, return `unavailable(...)` — never throw a fake value.
2. Swap it in for `fmpProvider` in `lib/providers/index.ts`.

Nothing else in the app changes — pages and routes only ever talk to the `marketData` interface. Use the `live()` / `demo()` / `unavailable()` helpers in `types.ts` so the honesty metadata is always set correctly.

---

## Database (Supabase)

The schema + Row Level Security live in `supabase/migrations/` (currently `0001`–`0018`). Apply them in order:

```bash
# with the Supabase CLI linked to your project:
supabase db push
# or paste the migration files into the Supabase SQL editor and run them in order.
```

Tables span several domains and grow with the migrations, including:

- **Investing / core:** `profiles`, `holdings`, `watchlist`, `watch_lists` / `watch_list_items`, `research_reports`, `shared_research`, `alerts`, `journal`, `portfolio_notes`, `stock_snapshots`, `recently_viewed`, `screener_preset_rankings`, `user_prefs`.
- **Predictions:** `prediction_markets`, `prediction_snapshots`, `shared_predictions`.
- **Money / Plaid:** `plaid_items`, `plaid_item_audit`, `plaid_transactions`, `plaid_merchant_rules`, `plaid_txn_overrides`, `cash`, `broker_connections`, `net_worth_snapshots`, `manual_items`.
- **Power Trades:** `power_sources`, `power_people`, `power_person_aliases`, `power_trade_records`, `power_disclosures_raw`, `power_source_sync_runs`, `power_influence_records`.
- **Ops:** `error_log`.

RLS is on for every per-user table; users can only touch their own rows (`auth.uid() = user_id`). Server-write-only tables (e.g. snapshots) have RLS on with no public write policy, and a trigger auto-creates a `profiles` row on signup.

---

## Project layout

```
app/                       # App Router pages + API routes
  page.tsx                 #   Overview (aggregated dashboard)
  dashboard|holdings|research|rankings|map|screeners|predictions/
  portfolio-doctor|power-trades|watchlist|journal/   # Invest
  money|accounts|transactions|spending|accounts-doctor/  # Money
  advisor|alerts/          # Insights
  admin|connectors/        # Admin-only
  login|signup|profile|settings|help|glossary/        # Account / auth
  api/                     # ~79 server routes (quote, financials, research,
                           #   plaid/*, etrade/*, power-trades/*, ai/*, chat, …)
lib/
  providers/               # data-honesty + swappable market-data adapters
    types.ts               #   DataResult<T>, domain types, provider interfaces
    fmp.ts demo.ts         #   market adapters
    congress-api.ts congress-demo.ts
    index.ts               #   <-- per-call provider selection
  ai/                      # task-aware router (Claude + Gemini), runtime keys
  plaid.ts plaid/          # bank/brokerage linking + categorization
  etrade/                  # E*TRADE OAuth client
  power-trades/            # congress / SEC Form 4 / executive / FEC influence
  screener/ scoring/ congress/ money/ advisor/ alerts/ research/
  connectors/              # runtime API-key registry (Connectors UI)
  glossary.ts nav.ts networth.ts watchlists.ts ...
components/                # ~84 UI components (cards, views, chat, sidebar, …)
utils/supabase/            # client.ts server.ts middleware.ts (auth wiring)
supabase/migrations/       # 0001–0018 schema + RLS
docs/                      # AI usage, screener filters
middleware.ts              # Supabase session refresh on every request
```

---

## Docs

- [Access guardrails (admin vs user)](GUARDRAILS.md) — the single source of truth for what regular users may see/do vs. what is admin-only, and where each rule is enforced.
- [AI usage & token-cost tiers](docs/AI_USAGE.md) — which endpoints are **light / medium / heavy**, the model each tier uses, and how chat picks its model per question.
- [Screener filters](docs/SCREENER_FILTERS.md) — which FMP screener fields are live vs. the wishlist needing a richer provider.
- [Build spec](STOCKPILOT_BUILD_SPEC.md) — the original product/build specification.

---

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add every env var you use (see the table above) in **Project → Settings → Environment Variables** — keep service-role, provider, Plaid, and AI keys server-side (do **not** prefix them with `NEXT_PUBLIC_`).
3. Deploy. Point `NEXT_PUBLIC_APP_URL` at the deployed URL and add that URL to your Supabase Auth redirect settings and Plaid/E\*TRADE OAuth callback allow-lists.

---

## The honesty rails (baked in on purpose)

The app keeps hard guardrails: timestamps on every figure, DEMO/unavailable badges, no fake precision, color-plus-words for direction, and the "not financial advice" disclaimer. It does **not** hardcode any buy/sell calls — recommendations come from real data plus the AI research route, always paired with a confidence level and the single biggest risk. The analytical features are built to *interpret* data skeptically, never to manufacture certainty a pretty chart might imply. Admin-only details (raw error/billing info, model names, re-run controls) are hidden from regular users — see [`GUARDRAILS.md`](GUARDRAILS.md).
