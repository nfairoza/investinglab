# Screener filters — what's live vs. what needs a richer data provider

The Screeners page filters are bounded by what our market-data provider (FMP) exposes
through its `company-screener` endpoint. We only ship filters that **actually filter** —
no decorative controls that silently do nothing.

## Live now (FMP `company-screener` query params)
These map 1:1 to `ScreenerFilters` in `lib/providers/types.ts` and are used by
`screenStocks()` in `lib/providers/fmp.ts`:

| UI filter            | FMP param(s)                                   |
|----------------------|------------------------------------------------|
| Market cap (min/max) | `marketCapMoreThan` / `marketCapLowerThan`     |
| Share price (min/max)| `priceMoreThan` / `priceLowerThan`             |
| Min/Max volume       | `volumeMoreThan` / `volumeLowerThan`           |
| Beta (min/max)       | `betaMoreThan` / `betaLowerThan`               |
| Min dividend ($)     | `dividendMoreThan`                             |
| Sector               | `sector`                                       |
| Industry             | `industry`                                     |
| Exchange             | `exchange` (NYSE, NASDAQ, AMEX, …)             |
| Type (Stock/ETF/Fund)| `isEtf` / `isFund`                             |
| Actively trading     | `isActivelyTrading`                            |

## Wishlist — NOT available from FMP screener (needs a richer provider)
These Robinhood-style filters require per-symbol metrics FMP's screener doesn't accept.
Adding them means either (a) a provider whose screener supports them (e.g. **Alpaca**, a
paid FMP tier), or (b) fetching per-symbol data and post-filtering client/server-side
(many extra calls — only viable with a generous quota). **Do not add these to the UI
until the data exists**, or they'll look real but do nothing.

- Relative volume; average vs. today's volume
- 52-week / 1-week / 1-month / 3-month relative high-low; new 52-wk high/low
- Daily / weekly / monthly / 3-month / yearly % change
- Analyst ratings (buy/hold/sell)
- Dividend **yield** (we only have raw dividend $), dividend date, ex-dividend date
- Earnings date
- Price-to-earnings ratio
- Shares outstanding
- Options (volume, IV, availability, …)
- Margin / maintenance requirement
- "Stocks I own" toggle (could be done locally by intersecting with holdings — a
  candidate to add without a new provider)

## When adding a provider (e.g. Alpaca)
1. Extend `ScreenerFilters` with the new fields.
2. Map them in `screenStocks()` (or a new provider adapter) + `/api/screener` param parsing.
3. Add the matching categories/controls in `components/screener-filters.tsx`.
4. Move the rows above out of this wishlist into the "Live now" table.
