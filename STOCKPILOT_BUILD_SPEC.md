# Noor Investing Lab — Build Specification (v4)

> **Product name:** The app is **Noor Investing Lab** (formerly "StockPilot AI"). GitHub: `nfairoza/investinglab`.
>
> **How to use this doc:** This is the complete, current build prompt. A runnable, building foundation already exists (see **§3 Current state**). This spec preserves the original brief and folds in everything built since (Congress tracker, refresh/caching model, in-app Claude key, charts, dashboard, holdings detail, expanded FMP endpoints, E*TRADE read-only sync, AI chat widget, persistent file database, and the jasmine theme). Where this spec and the existing code disagree, the existing *patterns* win — extend them.

---

## 1. Role & goal

You are a senior full-stack engineer **and** a patient finance teacher. Build a deployable personal investing dashboard, **StockPilot AI**, that helps one non-expert user make decisions about stocks they own and are watching, using **live** market data, and tracks **prediction-market odds**. It organizes information, shows it **visually** with charts, and produces a structured, **skeptical** research opinion with explicit risks.

**The user is not from a finance background** and wants to get better at investing. The app must **teach while it informs**: every term, metric, and recommendation is explained in plain English. It is **decision-support, not a guaranteed signal**.

**Top-level mandate:** every analytical output must (1) end in a clear action, (2) always show downside risk, and (3) always state what would change the recommendation.

---

## 2. Non-negotiable rules (build these FIRST, before any UI polish)

1. **Live data first.** Server-side API routes fetch latest price, financials, news, earnings dates, technicals. Never hardcode prices, financials, charts, valuations, or news.
2. **Honest data state.** If a key is missing or a call fails, render a **"Live data unavailable"** or **DEMO** badge on that exact data point/chart. Never present demo/mock data as if it were live. This is structural: every data point flows through `DataResult<T>` carrying `source` (`live`/`demo`/`unavailable`), `asOf`, `provider`.
3. **Always show the timestamp** next to any figure or chart ("Data as of …").
4. **No fake precision — use ranges.** Always separate **"good company" from "good stock."**
5. **Disclaimer on every research output:** "This is research and educational analysis, not financial advice."
6. **Color + words together, never color alone.** Up/down, buy/sell, live/demo all carry a label and an arrow/icon.
7. **API keys never reach the client.** All external calls happen in server routes. (The in-app Claude key field sends the key to the server, never to the browser — see §9.)

---

## 3. Current state — what already exists

A correct, runnable foundation exists and **compiles cleanly** (`npm install && npm run build` pass). Build on it; don't rebuild it.

**Runs today:** Next.js App Router + TS + Tailwind, dark mode, sidebar across all **13** tabs. The data-honesty layer end to end (`DataResult<T>`, `MarketDataProvider`, FMP + demo adapters, `/api/quote` + `/api/financials`, badges/timestamps). A live polling **QuoteProbe**. **Holdings** and **Watchlist** pages where you enter tickers/shares/cost (saved in the browser for now; live quotes + value/gain-loss/weight computed). A **Research** tab whose engine is wired to **Anthropic Claude** (generates the A–P memo + Action Table; degrades to "unavailable" without a key/data). A **Settings** tab to add your Claude key, choose a model, test, and refresh. A **Congress** tab (demo trade feed). The **Glossary** page. A **Supabase schema + RLS** migration.

**Deferred (your job, see §13):** Supabase auth + DB wiring (schema ready; move holdings/watchlist/research from browser/in-memory into per-user rows); shadcn/ui init; the full **chart library** (§5); the Buy/Sell timing + Alerts + Portfolio Doctor; the Predictions module; the real Congress data source + following; the aggregated Dashboard with market overview.

**Existing file tree:**
```
stockpilot/
  app/
    layout.tsx  page.tsx  globals.css
    holdings/page.tsx        # add tickers + shares, live value/gain-loss (local-first)
    watchlist/page.tsx       # add tickers + ideal buy, price vs target (local-first)
    research/page.tsx        # Claude-powered memo + Action Table
    settings/page.tsx        # add Claude key, model, test, refresh
    portfolio-doctor/page.tsx  predictions/page.tsx  congress/page.tsx
    alerts/page.tsx  glossary/page.tsx
    api/quote/route.ts  api/financials/route.ts
    api/research/route.ts          # GET cache-read (TODO persist), POST -> Claude
    api/congress/route.ts
    api/ai/status/route.ts  api/ai/key/route.ts  api/ai/test/route.ts
  components/
    sidebar.tsx  data-state.tsx  term.tsx  page-shell.tsx
    quote-probe.tsx  research-panel.tsx  congress-feed.tsx
    holdings-manager.tsx  watchlist-manager.tsx  settings-ai.tsx
  lib/
    providers/ types.ts fmp.ts demo.ts congress-api.ts congress-demo.ts index.ts
    glossary.ts
    research/ types.ts staleness.ts
    ai/ anthropic.ts runtime-key.ts
    local-store.ts
  supabase/migrations/0001_init.sql
  package.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts
  next-env.d.ts .env.example .gitignore README.md
```

**Pinned versions (keep):** Next `14.2.15`, React `18.3.1`, TS `5.6.2`, Tailwind `3.4.12`, SWR `2.2.5`, Recharts `2.12.7`, `@supabase/supabase-js` `2.45.4`, lucide-react, clsx.

---

## 4. Tech stack & architecture keystones

- Next.js (App Router) + React + TypeScript, Tailwind + **shadcn/ui**, **Recharts** for all charts, **Supabase** (auth + Postgres), server routes for all external data, one AI route for report generation.
- **Data-honesty contract:** `DataResult<T> = { data, source: "live"|"demo"|"unavailable", asOf, provider, note? }`. Helpers `live()`/`demo()`/`unavailable()`. Every adapter returns this; on missing key/failure it returns `unavailable(...)`, never a fake value.
- **Swappable provider adapters:** `MarketDataProvider` + `CongressTradesProvider`. Change a source by editing one file: `lib/providers/index.ts`.
- **Glossary = single source of truth** (`lib/glossary.ts`) powering both `<Term>` tooltips and the `/glossary` page.
- **Refresh & caching model (app-wide):**
  - *Market data (quotes/financials/technicals):* SWR `refreshInterval` ~60s, `revalidateOnFocus`, `keepPreviousData`, manual Refresh button. SWR auto-pauses when the tab is hidden. Poll conservatively (rate limits).
  - *AI research memo:* **cache-or-generate**, never on page load or a tight timer. Latest stored memo is served; the client flags staleness (**12h** threshold) and shows a "refresh?" nudge; a Generate/Refresh button regenerates and stores with a new timestamp.
  - *Congress feed:* refresh on view; lagged data, so daily-ish cadence.
  - *Persistence rule:* UI polling must **not** write a DB row per poll. Time-series snapshots are written by a **scheduled job** on a coarse cadence (daily EOD, hourly max), decoupled from polling. Add retention/downsampling; range-partition snapshot tables only if they grow large.

---

## 5. Visualization spec (build real, labeled charts — not decoration)

Use **Recharts**. **Every chart has: a title, axis labels, a one-line "what this chart tells you" caption, and a data timestamp.** Each answers a specific beginner question. Every chart degrades gracefully: if data is missing, show the chart frame with a "Live data unavailable" badge — never a fake line.

**Portfolio-level:**
- Portfolio value over time (line/area) → "Is my money growing?"
- Allocation donut/pie **by holding and by sector** → "Am I too concentrated?"
- Daily + total gain/loss bar per holding (green-up / red-down, labeled) → "What's winning and losing?"
- Winners vs losers ranked horizontal bar → "Where is my money working?"

**Per-stock:**
- Price history line with selectable ranges (1M/3M/6M/1Y/5Y).
- Overlay 50-day & 200-day moving averages; caption: "Above these lines, the trend is generally healthier."
- Support & resistance bands labeled "floor price area" / "ceiling price area".
- **Buy / Add / Hold / Trim / Sell price-zone bar:** a horizontal price scale colored into zones with the current price marked, so the user can *see* where today's price sits.
- Valuation-vs-history chart: current P/E (or EV/Sales) vs its own 5-year range, with a marker → "Expensive or cheap vs its own past?"
- Revenue & earnings trend bars (last 8 quarters) → "Is the business actually growing?"
- Margins trend line (gross/operating) → "Keeping more of each dollar over time?"
- Scenario fan/range chart: bull / base / bear / **severe-downside** implied price as a labeled range bar with probabilities → "What could happen and how likely?"
- Risk/reward visual: two-bar or gauge, upside vs downside.
- **Recommendation gauge:** a dial/badge (Buy / Buy gradually / Hold / Wait / Avoid / Sell) **always** paired with confidence % and the single biggest risk.

**Prediction markets:** implied-probability-over-time line per tracked market → "Are the odds rising or falling?"

---

## 6. Pages / tabs (10)

Dashboard, Holdings, Watchlist, Research, **Rankings**, Portfolio Doctor, Predictions, **Congress**, Alerts, **Journal**, Glossary, **Connectors**, Settings. Dark mode, clean cards, tables, Recharts everywhere relevant, green/red **with labels + arrows**, mobile responsive, simple sidebar, consistent tooltip styling.

---

## 7. Sections

### A — Holdings tracker (stocks I own)  *(input UI exists; charts + detail page TODO)*
Add holdings with: ticker, company name, shares owned, average cost, current price (live), market value, unrealized $ and % gain/loss, portfolio weight, original buy reason, time horizon, risk tolerance, notes. Each holding **detail page** shows (with charts + plain-English captions): current price, my cost, gain/loss, fair value range, bull-case price, bear-case price, ideal add price, trim price, sell/invalidation price, next earnings date, recent news, fundamentals, valuation, technical setup, risk/reward, thesis status (stronger / unchanged / weaker / broken), and a final action (Hold / Add now / Add on pullback / Trim / Exit watch / Sell). **End every holding page with the Action Table (§12) + the price-zone bar + recommendation gauge.**

### B — Watchlist (stocks I might buy)  *(input UI exists; charts TODO)*
Per ticker: current price, ideal buy price, fair value estimate, bull case, bear case, risk/reward rating, technical setup, next catalyst, and AI action (Buy now / Start small / Wait / Avoid). Include the price-zone bar showing where today's price sits vs the ideal buy price.

### C — Research engine (the analytical brain)  *(wired to Claude; persistence + charts TODO)*
User enters any ticker. Fetch latest: price, market cap, enterprise value, 52-week range, volume, financial statements, revenue/EPS growth, FCF, gross/operating margin, net income, cash, debt, valuation multiples, analyst estimates (if available), earnings date, recent news, SEC filings, technicals (MAs, RSI, support/resistance). The AI route generates a memo with these **exact** sections, each in **Pro** and **Beginner ("Explain Like I'm New")** modes:

- **A. Executive Summary**
- **B. Final Rating** — Buy / Buy gradually / Hold / Wait / Avoid / Sell (gauge + confidence)
- **C. Current Market Data** (with timestamp)
- **D. Business Overview** ("what does this company do and how does it make money?")
- **E. Investment Thesis**
- **F. Financial Analysis** (interpret the numbers, don't just list them; each metric gets a plain-English line)
- **G. Growth Sustainability**
- **H. Valuation Analysis** (EV/Sales, EV/EBITDA, P/E, P/FCF, FCF yield, vs own history and peers, DCF) — with the valuation-vs-history chart
- **I. Reverse DCF: What Is Priced In?** ("what does today's price assume, and is that realistic?")
- **J. Technical Setup & Entry Timing** (buy zones, invalidation levels) — with the price-zone bar
- **K. Sentiment & Catalysts** (over 3 / 6 / 12 / 24 / 36 months)
- **L. Full Risk Register** — for **each** risk: description, why it matters, probability (low/med/high), severity (low/med/high), time horizon, evidence that would confirm it, evidence that would reduce it, estimated valuation impact
- **M. Scenarios** — Bull / Base / Bear / **Severe Downside** — each with assumptions, revenue growth, margin trajectory, FCF, valuation multiple, implied price range, probability, expected return — shown as the scenario range chart
- **N. Probability-Weighted Expected Return**
- **O. Portfolio Action Plan**
- **P. Final Verdict**

**AI rules (must follow):** always state the data date; say if data is delayed/unavailable; no fake precision (ranges); separate good company from good stock; be skeptical, not promotional; don't assume a high-quality company is automatically a buy; don't treat AI exposure as automatically positive (analyze monetization **and** competitive threat); compare the expectations embedded in the valuation against realistic outcomes; always explain downside; always state what would change the recommendation; identify the single most important variable, the biggest hidden risk, and the most misunderstood upside driver; in Beginner mode define every term inline with simple analogies; **before the final verdict, self-challenge ("what could I be missing?") and revise**; always append the disclaimer.

### D — Buy/Sell timing tool  *(TODO)*
Per stock, via the price-zone bar: buy zone, add zone, hold zone, trim zone, sell/invalidation level, support, resistance, trend direction, momentum, risk/reward ratio. Answer plainly: buy now? wait? add? trim? sell? what price to watch?

### E — Alerts  *(TODO)*
Create alerts for: price hits buy zone, price hits trim zone, price breaks support, price below invalidation, earnings approaching, major news, portfolio weight too high, thesis status changes — plus `congress_follow_trade` (a followed member disclosed a trade in a held/watched ticker). Store rules in `alerts`; evaluate server-side on each refresh.

### F — AI Portfolio Doctor  *(TODO)*
Reviews all holdings (with a concentration donut + risk heat visual): strongest, riskiest, overvalued, broken-thesis, don't-add, consider-trimming, better-opportunities, too-concentrated, too much sector exposure. Each finding in plain English.

### G — AI Predictions  *(DONE — see §15.13)*
**Scope changed from the original brief.** The owner does NOT want Polymarket/Kalshi market-implied odds. Instead, the Predictions tab is **Claude researching a stock** — it pulls live FMP data (quote, financials, profile, analyst, DCF) AND uses Anthropic's `web_search` tool to read current news, then returns a probabilistic, multi-horizon prediction. Always framed as an AI opinion, never a guarantee. (The Polymarket/Kalshi approach is abandoned; `prediction_snapshots` table is unused.)

### H — Dashboard (build LAST)  *(TODO)*
Visual-first: portfolio value over time, daily gain/loss, total unrealized gain/loss, allocation donut, top winners, top losers, stocks needing attention, upcoming earnings, watchlist alerts, **market overview (SPY, QQQ, S&P 500, Nasdaq, VIX if available)**, and a strip of pinned prediction-market odds. Include a "What should I look at first?" callout.

### Congress tracker (extension beyond original)  *(tab + demo feed exist; real source + following TODO)*
Disclosed congressional trades under the STOCK Act. Honesty caveats baked into the UI: **lagged disclosure, not live positions** (45-day window; show trade date vs disclosure date); **amounts are ranges**, not exact; a disclosure is **not a signal**. Demo data uses **fictional** member names on purpose — never attribute fabricated trades to real politicians. Provider `CongressTradesProvider` (`getRecent/getByMember/getByTicker`). To go live: implement `lib/providers/congress-api.ts` against a normalized-JSON source (Quiver Quantitative, Lambda Finance, Apify scrapers, or Capitol Trades; the raw House Clerk + Senate eFD portals are PDF-based; the old Stock Watcher S3 feeds are dead) and set `CONGRESS_TRADES_API_KEY` + `_BASE`. Add `congress_follows` + the `congress_follow_trade` alert.

---

## 8. Beginner / learning layer (everywhere)

Plain-English first ("what this means" + "why it matters" on every metric). `<Term>` tooltips (hover + tap) on **every** jargon term (P/E, EV/EBITDA, EV/Sales, FCF, FCF yield, DCF, reverse DCF, RSI, moving average, support/resistance, margin, dilution, market cap, enterprise value, Rule of 40, plus STOCK Act / PTR / disclosure-window). "Explain Like I'm New" toggle on every research report and holding page (Pro ↔ Beginner). A Glossary page (alphabetized). Color + words together. A "What should I look at first?" callout on each page. **Honesty over polish** — every recommendation visual sits next to a confidence level and the top risk; a pretty chart never implies false certainty.

---

## 9. AI provider & the Claude key (how research is generated)

The research engine uses **Anthropic's Claude** via one server route (`/api/research` POST → `lib/ai/anthropic.ts`). Key resolution: a key entered in **Settings** (runtime, dev only) → `ANTHROPIC_API_KEY` → `AI_API_KEY`. Model: Settings → `AI_MODEL` → default `claude-sonnet-4-6` (Opus available for deeper analysis at higher cost). With no key or no underlying data, the route returns `source: "unavailable"` with a clear note — it never invents a memo. The memo's source follows the **data**: built on live data → `live`; on demo data → `demo`.

**Adding your key — two ways:**
1. **Deployment (preferred, secure):** set `ANTHROPIC_API_KEY` in `.env.local` (local) or your host's env (Vercel). Read server-side only.
2. **Local testing:** the **Settings** page has a Claude key field + model picker + **Test connection** + **Refresh** status. The key is POSTed to your own server and held **in memory for that dev session** — never stored in the browser, never echoed back, gone on restart. For multi-user/production, store per-user keys encrypted in the DB once auth is wired.

---

## 10. Data providers & environment

- **Market/financials:** default adapter = Financial Modeling Prep; swappable (Polygon, Finnhub, Alpha Vantage, Twelve Data). Keys `MARKET_DATA_API_KEY` / `FINANCIAL_DATA_API_KEY`. No key → demo mode.
- **FMP key persistence:** set `MARKET_DATA_API_KEY` in `.env.local` (loaded automatically at startup, survives restarts). Can be overridden at runtime via the Connectors tab. `.env.local` is gitignored and never committed.
- **CRITICAL — FMP uses the STABLE API, not legacy v3/v4.** FMP retired `/api/v3` and `/api/v4` on **2025-08-31**; keys issued after that get HTTP 403 on those URLs. `lib/providers/fmp.ts` targets `https://financialmodelingprep.com/stable/*` with `?symbol=` query params. Do NOT revert to the `/api/v3/quote/SYMBOL` path style.
- **FMP free-tier limits (handled gracefully):** quotes, financials, earnings, profile, analyst price-target/grades, DCF, and peers work on the free plan. Live technical-indicator (SMA/RSI series), insider-trading, and news endpoints return **HTTP 402** (paid only) — the adapter degrades these to `unavailable` and derives the 50/200-day moving averages from the quote's `priceAvg50`/`priceAvg200` fields so the scoring engine still works.
- **Filings:** SEC EDGAR (`SEC_API_KEY`, optional). **News:** `NEWS_API_KEY`. **Prediction markets:** Polymarket / Kalshi (`PREDICTION_MARKET_API_KEY`). **Congress:** `CONGRESS_TRADES_API_KEY` + `CONGRESS_TRADES_API_BASE`. **AI:** `ANTHROPIC_API_KEY` / `AI_API_KEY` / `AI_MODEL`.
- Everything except `NEXT_PUBLIC_*` is server-only.

### FMP endpoints implemented (and available to extend)

**Currently wired** (`lib/providers/fmp.ts` → routes → UI):
| Route | FMP endpoint | Type |
|---|---|---|
| `/api/quote` | `/quote/{symbol}` | Real-time quote |
| `/api/financials` | `/income-statement` + `/cash-flow-statement` | Quarterly financials |
| `/api/technicals` | `/technical_indicator/1day` (SMA50, SMA200, RSI14) | Technicals |
| `/api/news` | `/stock_news` | Stock news |
| `/api/earnings` | `/historical/earning_calendar` | Earnings date |
| `/api/profile` | `/profile/{symbol}` + `/v4/stock_peers` | Company profile + peers |
| `/api/analyst` | `/v4/price-target-summary` + `/v4/grades-consensus` + `/v4/grades` | Analyst ratings + price targets |
| `/api/insider` | `/v4/insider-trading` | Insider buy/sell transactions |
| `/api/dcf` | `/discounted-cash-flow/{symbol}` | DCF intrinsic value |

**FMP endpoints available but not yet wired** (extend as needed):
- `/v4/levered-dcf` — Levered DCF (post-debt valuation)
- `/balance-sheet-statement` — Balance sheet (debt/equity ratio for scoring)
- `/key-metrics-ttm` — KPIs: P/E, EV/EBITDA, P/FCF, ROE, debt/equity (one call, many factors)
- `/v4/price-target-rss-feed` — Live analyst price target RSS
- `/v4/earnings-surprises` — Historical EPS beat/miss
- `/historical-daily-discounted-cash-flow` — DCF history for valuation-vs-history chart
- `/v4/esg-environmental-social-governance-data` — ESG ratings
- `/economic` — Macro indicators (GDP, CPI, Fed funds rate)
- `/v4/insider-trading` with `transactionType=P-Purchase` — Only insider buys
- `/v3/stock-screener` — Bulk screener for full-universe ranking (paid tier)
- `/v3/sp500_constituent` / `/v3/nasdaq_constituent` — Index constituents for universe seeding

**Priority next additions for scoring engine:**
1. `/key-metrics-ttm` → adds `debtToEquity`, `peRatioTTM`, `pegRatio`, `priceToBookRatio` (fills currently-unavailable scoring factors)
2. `/balance-sheet-statement` → debt/equity for scoring factor
3. `/v4/earnings-surprises` → earnings beat/miss history for risk assessment
4. `/v4/grades` → analyst upgrade/downgrade trend for scoring factor (`analystTrend`)

---

## 11. Database (Supabase) — `0001_init.sql` exists

Tables (all RLS, owner = `auth.uid() = user_id`): `profiles` (1:1 with `auth.users`, `beginner_mode` default true), `holdings`, `watchlist`, `research_reports` (JSON memo + `data_as_of`), `alerts`, `portfolio_notes`, `stock_snapshots` (server-write-only, RLS on, no public policy), `prediction_markets`, `prediction_snapshots`. Trigger auto-creates a `profiles` row on signup. **Add:** `congress_follows` and a `congress_trades` cache, owner-scoped. **Phase 4/5 wiring:** move holdings/watchlist from browser localStorage and research from in-memory into these tables.

---

## 12. Required Action Table (every stock page ends with this)

```
Current price:            Upside potential:
My cost basis:            Downside risk:
Gain/loss:                Risk/reward:
Fair value range:         Final action:
Add below:                Confidence:
Trim above:               Main reason:
Sell/invalidation level:  Biggest risk:
                          Next catalyst:
                          Data as of:
```
(The Research panel already renders this 16-field table from the generated memo; Holdings detail pages must render it too.)

---

## 13. Build order (verify each phase before the next)

1. **Foundation** — Next/TS/Tailwind/shadcn, sidebar, dark mode, auth scaffold, DB schema, demo-mode, loading/empty/error, tooltip + glossary. **[DONE except shadcn + auth]**
2. **Live data layer** — adapters + routes (quote/financials/news/earnings/technicals/profile/analyst/insider/DCF), timestamp + DEMO badge. **[DONE — FMP key persisted in .env.local, all routes wired]**
3. **Reusable chart components** (§5) with captions + tooltips. **[DONE — PriceHistoryChart, RevenueEarningsChart, MarginChart, AllocationDonut, GainLossBar, ScenarioRangeChart, PriceZoneBar, RecommendationGauge]**
4. **Holdings tracker** (§A) — detail page + charts + Action Table. **[DONE — detail page at /holdings/[symbol] with score, price zone, charts, AI memo + Action Table; move to Supabase TODO]**
5. **Watchlist** (§B) — to Supabase; price-zone bar. **[PARTIAL — input + price-vs-target done; move to Supabase + price-zone bar TODO]**
6. **Research engine + AI report + ELI-New** (§C) — persist memos, richer A–P. **[DONE — charts, RecommendationGauge, ScenarioRangeChart, Action Table all wired; DB persistence TODO]**
7. **Buy/Sell timing + Alerts + Portfolio Doctor** (§D/E/F). **[TODO]**
8. **Prediction markets** (§G). **[TODO]** — and wire the real **Congress** source + following.
9. **Dashboard + market overview + Glossary polish** (§H). **[DONE — AllocationDonut, GainLossBar, top winners/losers, market overview (SPY/QQQ/VIX), smart callout]**

**Next priorities:**
- Add `/key-metrics-ttm` to scoring engine for debt/equity, PEG, forward P/E factors (fills the 4 "—" gaps in ScoreCard)
- Alerts + Portfolio Doctor (Phase 7)
- Supabase auth + move local-first data to DB (Phase 4/5)

For every phase: keep the rules (§2), route data through `DataResult`, wrap new jargon in `<Term>` + add to glossary, render the price-zone bar / recommendation gauge / Action Table where the spec calls for them, and end user-facing pages with the disclaimer.

---

## 14. Deliverables & honesty recap

Full repo: pages, reusable chart components, tooltip + glossary system, server routes, swappable adapters, Supabase schema + migrations, `.env.example`, README (local setup + Vercel deploy), error/loading/empty states, demo mode labeled, responsive UI. **Prioritize a working, decision-oriented, VISUAL, beginner-friendly app over long static reports.** Every stock view must help the user **DECIDE** (Buy now / Wait / Hold / Add / Trim / Sell) and **LEARN** (why, in plain English). Keep the app's guardrails (timestamps, DEMO/unavailable badges, ranges not precision, color-plus-words, separate good-company-from-good-stock); do not hardcode buy/sell calls — they come from data + the AI memo, always with a confidence level and the single biggest risk.

> **Research and educational analysis, not financial advice.**

---

## 15. This build's additions (scoring, rankings, journal, connectors, providers)

These extend the original brief and are already scaffolded — keep and grow them.

### 15.1 Connectors & API keys (one place for every data source)
A **Connectors** tab manages keys for every provider: **FMP (stock data)**, **E*TRADE (portfolio sync)**, SEC EDGAR, news, Congress, Alpaca, prediction markets — plus the **Claude/AI** control (model picker + Test). Each shows connected/not-connected status and a phase badge. Keys entered in the UI are POSTed to the server and held **in memory for the session** (never in the browser); env vars are the deployment path. **Provider selection is per-call**, so adding a key flips demo→live immediately. **Stock data source = FMP** (`MARKET_DATA_API_KEY`); add it in Connectors and the whole app goes live.

**Rollout plan (Noor's):** Phase 1 — FMP + E*TRADE → research brain + real portfolio positions. Phase 2 — Alpaca ($99/mo) for live market data + trading infrastructure. Phase 3 — paper trading to test recommendations before real money. Roles: FMP = research brain; E*TRADE = real account positions (read-only, free); Alpaca = live market/trading engine; **PostgreSQL = memory/cache/history**; AI = explanation + ranking + risk checks.

### 15.2 Scoring engine (transparent, not "AI says buy")
`lib/scoring/score.ts` computes a **rules-based 0–100 score** from real data — readable, not a black box. Factors: **price trend** (vs 50/200-day MAs), **momentum** (52-wk range + RSI), **revenue growth** (YoY), **EPS growth** (YoY), **valuation** (trailing P/E), **operating margin**, **free cash flow**, **earnings proximity**. Factors the current FMP adapter can't fill yet — **debt/equity, analyst changes, unusual volume, MACD** — are shown as "needs data" (excluded from the math, never faked); wire them when you add forward estimates / Alpaca. Scores are computed **per horizon** (1W/1M/1Y/5Y) with different factor weights, plus an overall score + label (Strong/Favorable/Neutral/Weak/Avoid), the **best horizon**, a heuristic **entry zone** and **stop-loss**, and the **major risk**. Served at `/api/score?symbol=`; shown on the Research tab next to the AI memo. The score is only as live as its data (live data → `live`; demo → `demo`). *To extend:* add `forwardPE`, `peg`, `debtToEquity`, `avgVolume`, `analystTrend`, `macd` to the adapter + new factors.

### 15.3 Rankings (your Top-10 outputs)
A **Rankings** tab scores a universe and produces: **Top 10 — 1-week momentum**, **Top 10 — 1-month swing**, **Top 10 — undervalued growth (1 year)**, **Top 10 — compounder candidates (5 years)**, **Avoid this week** (imminent earnings / weak momentum), and **portfolio warnings** (hold/add/trim/watch on what you own). Each name links to its full research. **Universe today = a seed list + your tracked tickers.** Ranking the **full US market** requires a screener/bulk data source (paid FMP endpoints) plus the Postgres cache for history and to avoid rate limits — that is the main thing to build for "research ALL US stocks." Build a nightly job that pulls + scores the universe into `stock_snapshots`, and have Rankings read the cached scores.

### 15.4 Per-stock output fields
Every researched stock should surface: **Bull case, Bear case, Why now?, Best time horizon, Entry zone, Stop-loss / invalidation, Earnings date, Major risk.** Best-horizon / entry / stop / earnings / major-risk come from the **scoring engine** (deterministic); bull case / bear case / why-now come from the **AI memo** (§6, sections L–M and the thesis). Render them together on the stock view.

### 15.5 Valuation dashboard, technical signals, earnings-risk alerts
- **Valuation dashboard** (build as charts in Phase 3): P/E, forward P/E, PEG, revenue growth, gross margin, FCF, debt/equity — with the valuation-vs-history chart from §5.
- **Technical signals:** RSI, MACD, moving averages, 52-week high/low, volume spikes — surfaced on the stock view and feeding the score's trend/momentum factors.
- **Earnings-risk alerts:** "AMD earnings in 5 days," "NVDA moved 8% after last earnings," "IV crush risk." The scoring engine already flags earnings within 7 days; turn these into `alerts` rows (kind `earnings_approaching`) and Dashboard cards. Post-earnings move size and IV-crush need options/earnings-history data (add via FMP/Alpaca).

### 15.6 Journal
A **Journal** tab logs each trade: **why you entered, target price, stop-loss, what would make you exit, status (open/closed), and the result after 1 week / 1 month.** Local-first now; move to a `journal` table (owner-scoped) in Phase 4. This is the learning loop — every AI recommendation should be journaled and reviewed against its outcome (and, in Phase 3, paper-traded first).

### 15.7 E*TRADE connector (read-only portfolio sync)

**Status: DONE.** E*TRADE is integrated as a read-only brokerage connector. It uses **OAuth 1.0a with HMAC-SHA1** — the user logs in on E*TRADE's own website and grants access; the app never sees the password. Tokens are stored server-side only in `lib/etrade/token-store.ts`.

**Flow:**
1. Enter consumer key/secret in Connectors tab (or set `ETRADE_CONSUMER_KEY` / `ETRADE_CONSUMER_SECRET` in `.env.local`)
2. Click "Connect to E*TRADE" → redirected to E*TRADE login → authorize → redirected back
3. Account dropdown appears — pick which account to sync
4. Holdings tab → "↓ Sync from E*TRADE" → real positions populated automatically

**Key files:**
- `lib/etrade/oauth.ts` — pure HMAC-SHA1 OAuth 1.0a signing (no npm package, uses Node crypto)
- `lib/etrade/token-store.ts` — server-only in-memory token + account cache
- `lib/etrade/client.ts` — authenticated E*TRADE API wrapper (`etradeGet`, `fetchRequestToken`, `fetchAccessToken`)
- `app/api/etrade/connect/route.ts` — starts OAuth (oob), returns authorize URL
- `app/api/etrade/verify/route.ts` — takes the pasted verification code, exchanges for an access token, caches account list
- `app/api/etrade/status/route.ts` — connection status + accounts (no tokens exposed)
- `app/api/etrade/select-account/route.ts` — saves selected account
- `app/api/etrade/positions/route.ts` — fetches equity positions → `Holding[]` shape
- `app/api/etrade/disconnect/route.ts` — clears all tokens
- `components/etrade-connector.tsx` — full OAuth UI card (credentials → connect/open tab → paste code → account picker → connected → reconnect on expiry)

**IMPORTANT — out-of-band (oob) flow:** E*TRADE **rejects real callback URLs with HTTP 400**. It only supports the oob flow: `oauth_callback=oob` on the request-token call, then after the user clicks Accept on E*TRADE's site it displays a short **verification code** the user pastes back into the app. There is NO `/callback` route. Do not reintroduce a redirect-based callback — it will 400.

**Token expiry:** E*TRADE tokens expire at midnight ET daily. When `/api/etrade/positions` returns 401, the Holdings sync button shows an error with a link to Connectors; the Connectors card shows a "Reconnect E*TRADE" prompt.

**Scope — read-only only.** Only these endpoints are called: `/v1/accounts/list.json` and `/v1/accounts/{key}/portfolio.json`. No order, quote, option chain, or alert endpoints are used or available through this connector.

**Mapping:** E*TRADE equity positions → `Holding { id, symbol, shares, avgCost, note: "Synced from E*TRADE (AccountName)" }`. Existing manual holdings are preserved; only new symbols are added on sync.

### 15.8 Floating AI chat widget

**Status: DONE.** A floating chat button (bottom-right corner of every page) opens a portfolio-aware Claude chat overlay. The panel floats above the page without interrupting navigation.

**What Claude knows per message:**
- All current holdings with shares, avg cost, live price, and gain/loss computed client-side
- Watchlist tickers
- Current page URL (so it can be contextual — e.g. knows you're on /holdings/AMD)
- Last 12 messages of conversation history (follow-up questions work naturally)

**Key files:**
- `app/api/chat/route.ts` — POST endpoint; builds a portfolio-aware system prompt, streams the Anthropic SSE response directly to the client (word-by-word appearance)
- `components/chat-widget.tsx` — floating button + slide-up overlay panel; reads holdings/watchlist from localStorage, fetches live quotes for context, sends to `/api/chat`, parses SSE stream with `getReader()`
- `app/layout.tsx` — `<ChatWidget />` mounted outside `<main>` so it floats above all pages

**UX details:**
- Empty state shows 4 suggested questions ("Why am I down today?", "Which holding has the most risk?", etc.)
- User messages: right-aligned brand-gold bubbles. Assistant: left-aligned slate bubbles with streaming cursor `▌`
- Enter sends, Shift+Enter = newline. Clear button resets conversation.
- No Claude key → amber banner with link to Connectors tab
- Reads holdings/watchlist via `/api/holdings` + `/api/watchlist` (the persistent DB, see §15.10)

**Rules baked into the system prompt:** be concise (chat, not a report), honest about uncertainty, never give specific price targets without caveats, always mention the biggest risk, end analysis with the educational disclaimer. No trade execution of any kind.

### 15.10 Persistent file database (lowdb)

**Status: DONE.** Replaces browser localStorage with a server-side JSON file so data survives restarts, browser clears, and works identically on a laptop or an EC2 instance. No external database, no cost, no extra service to manage. Chosen over SQLite because `better-sqlite3` needs a native C++ build toolchain (unavailable on the target Windows box); `lowdb` is pure JS and installs cleanly.

**Key files:**
- `lib/db/index.ts` — `LowSync` singleton over `data/db.json`. Exports typed `Holding`, `WatchItem`, `JournalEntry` interfaces, `getDb()` (read-fresh accessor), and `withDbWrite(fn)` — a promise-chained mutex that serializes read-modify-write so overlapping requests (e.g. an E*TRADE sync overlapping a manual add) can't clobber each other.
- `app/api/holdings/route.ts` — GET / POST (single upsert by symbol, or `{replace:true, holdings}` bulk for E*TRADE) / DELETE. Replace mode keeps manual rows, drops manual rows whose symbol now comes from E*TRADE (no duplicate tickers), and replaces all prior E*TRADE rows.
- `app/api/watchlist/route.ts` and `app/api/journal/route.ts` — same GET/POST/DELETE pattern.

**Storage:** `data/db.json`, gitignored — your data never goes to GitHub. Back it up by copying that one file. `next.config.mjs` marks `lowdb` as a `serverExternalPackage`.

**All UI reads/writes go through these routes** via SWR (`HoldingsManager`, `WatchlistManager`, `Journal`, `DashboardClient`, `Rankings`, `HoldingDetail`, `ChatWidget`). `lib/local-store.ts` was deleted. The Supabase schema in `supabase/migrations/0001_init.sql` is retained as a future option but is NOT used — there is no Supabase dependency, account, or cost.

### 15.11 Branding & theme (Noor Investing Lab — jasmine)

**Status: DONE.** Renamed from StockPilot AI to **Noor Investing Lab** throughout (title, sidebar wordmark, chat header, AI system prompt).

- **Palette:** jasmine-gold `brand-*` scale defined as CSS variables in `app/globals.css` and exposed through `tailwind.config.ts` (`brand-50…950`, primary `#d4a82a`). All former `sky-*` accents were swapped to `brand-*`. Base background is a deep botanical green-black `#0b0f0a`.
- **Logo:** a five-petal jasmine blossom SVG (`JasmineMark` in `sidebar.tsx`) that gently floats (`floatPetal` keyframe). Wordmark uses a Playfair Display serif (`font-display`).
- **Motion (all in `globals.css`, all respect `prefers-reduced-motion`):**
  - `animate-fade-in-up`, `animate-fade-in`, `animate-scale-in` keyframe utilities
  - `.stagger` — cascading entrance for card grids
  - `.card-hover` — subtle lift + jasmine-gold border glow on hover, applied to all chart/panel cards
  - Global 200ms ease transitions on interactive elements
  - **Parallax:** soft jasmine-gold radial glow via `background-attachment: fixed` so it stays put as content scrolls
  - `PageTransition` (`components/page-transition.tsx`) re-keys on pathname to fade each page in
  - Sidebar nav items slide + icon-scale on hover; chat button scales on hover/press, panel scales in from its corner

### 15.13 AI Predictions (Claude + web search)

**Status: DONE.** The Predictions tab is Claude-as-analyst, not a market-odds feed (see §G).

- `app/api/predict/route.ts` — POST `{symbol}`. Gathers live FMP data (quote, financials, profile, analyst, DCF), then calls the Anthropic Messages API with the **`web_search_20250305`** server tool (max 4 searches) so Claude reads current news. Returns structured JSON: overall summary, per-horizon direction+confidence+reason (1wk/1mo/1yr), price-target range, biggest risk, what-would-change-my-mind, and key headlines found.
- `app/predictions/page.tsx` + `components/prediction-workspace.tsx` — ticker input → prediction cards with confidence bars, colored direction (▲/▼/▬ + word), risk callout, and the headlines Claude surfaced. DEMO/LIVE badge + disclaimer.
- Degrades cleanly: no Claude key → message linking to Connectors; no market data → message to check ticker/FMP key.

### 15.14 Updated tab list & remaining work
Tabs (13): Dashboard, Holdings, Watchlist, Research, **Rankings**, Portfolio Doctor, **Predictions (AI)**, Congress, Alerts, **Journal**, Glossary, **Connectors**, Settings. Work remaining: (a) **Alerts** + **Portfolio Doctor** pages (still `PageShell` placeholders); (b) `<Term>` tooltips are defined + glossary exists but are not yet used inline across pages (beginner-layer gap); (c) Watchlist analytical fields (fair value, bull/bear, price-zone); (d) richer per-stock charts (valuation-vs-history, real price line + ranges, visual price-zone bar); (e) feed the Research memo more data (technicals/news/analyst, not just quote+financials); (f) optional EC2 deploy.
