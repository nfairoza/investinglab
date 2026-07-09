# Portfolio return methodology (F5)

## What we compute
"Your return" on the Portfolio header is a **time-weighted-return proxy**: the
percentage change of your **investment balance** (the `investment` slice of
`net_worth_snapshots.by_type`) between the start and end of the selected window
(1M / 3M / YTD / 1Y). YTD is the default — no cherry-picked window.

The benchmark (S&P 500 via SPY, plus a user-selectable second benchmark) is the
simple price change of that benchmark over the same window, from FMP daily price
history.

## Known limitation (stated honestly in the UI)
This v1 does **not** correct for cash flows. If you deposit or withdraw during
the window, that movement is counted as if it were market performance — a large
deposit will look like a gain. We detect a likely deposit/withdrawal (a
single-day balance jump > 20%) and show a caveat on the figure when present.

A cash-flow-correct TWR (chaining sub-period returns across deposit/withdrawal
days, or a Modified Dietz money-weighted return) is a planned upgrade. Until
then, treat the comparison as directional, not a broker-grade performance number.

## Data sources
- Portfolio series: `net_worth_snapshots` (monthly), `by_type.investment`.
- Benchmark series: FMP `historical-price-eod/light` (`getPriceHistory`), 24h cached.

## Not advice
Returns are historical and educational. Past performance does not predict future
results. Nothing here is financial advice.
