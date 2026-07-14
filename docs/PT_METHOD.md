# Power Trades — method & honesty notes

Power Trades turns public disclosure feeds into evidence-graded signals. Every
derived number is computed by deterministic code (no LLM), carries its evidence,
and is stamped with an `asOf` date. This doc is the reference the UI links to
whenever it shows a computed statistic.

## Sources

- **Congressional trades** — Senate eFD + House Clerk periodic transaction
  reports (PTRs), via FMP. Amounts are disclosed as **bands** ("$50,001–100,000"),
  not exact figures. Filings lag the trade by up to 45 days.
- **Insider trades** — SEC Form 4 (EDGAR). Transaction codes distinguish
  open-market purchases (code **P**) from option exercises (M/X) and planned
  10b5-1 sales.
- **Executive** — curated OGE Form 278-T entries (admin-verified, source-linked).
- **Committee assignments** — the public-domain `unitedstates/congress-legislators`
  dataset (see PT4).

We never fabricate a midpoint for a band in user-facing copy — a band stays a
band. Bands are only midpointed internally where a single number is unavoidable
(e.g. weighting), and that is always disclosed.

## PT1 — Signal decay (lag + since-trade returns)

For every trade row we show:

- **Lag** = `disclosure_date − transaction_date` in calendar days. Color-neutral:
  it's context, not a judgment.
- **Since-trade** = the ticker's price move from the **trade-date close** to the
  latest available close.
- **Since-disclosure** = the move from the **disclosure-date close** to the latest
  close — the return a follower could actually have captured, since that's when
  the trade became public.

A trade/disclosure date that falls on a non-trading day uses the **next**
available close. Returns are precomputed nightly (`pt-returns`) into
`power_trade_returns`; rows never compute on pageview.

## PT3 — Track records (does following this person work?)

For each person we measure whether their **disclosed buys beat simply buying the
S&P 500** over the following weeks.

- **Universe**: disclosed **BUYS only**, in the **trailing 24 months**. Options
  excluded. Sells and holdings are not scored.
- **Anchor date**: the **disclosure date** — the actionable date, when the public
  could first have acted. Not the (earlier, non-public) trade date.
- **Excess return**: for each buy, `(stock return from disclosure to +Nd) −
  (SPY return over the same calendar window)`. This is market-neutral: it isolates
  the pick from the market's overall drift.
- **Windows**: +30, +90, +180 calendar days. A non-trading target day rolls
  forward to the next close; both the stock and SPY legs are aligned the same way.
- **Win rate**: the share of buys with a **positive excess** return.
- **Weighting**: trades are **equal-weighted**. Amount bands are not used here.
- **Honesty guard**: with **fewer than 8 realized trades** in a window, we show
  **"insufficient history (n)"** instead of a percentage — small samples are noise.
- A trade whose window hasn't fully elapsed yet (no +Nd close available) is
  excluded from that window until the data exists.

Computed nightly (`pt-track-records`) into `power_track_records`.

### Influence-score input

The people directory's influence/conviction score can take a **small** weighted
input from the track record. The base score weights (Capital / Legislative edge /
Cluster / Options proxy) are unchanged; the track-record term is additive and
capped so a strong historical record nudges, but never dominates, the score. Any
change to that weight is noted in the score's method tooltip.

## PT4 — Committee jurisdiction overlap

A congressional trade is flagged **"committee overlap"** when the traded ticker's
GICS sector falls within the jurisdiction of a committee the member sits on
(e.g. Armed Services → Industrials/defense names). Mappings are **conservative
and hand-authored** (`lib/power-trades/committee-jurisdictions.ts`), one comment
per mapping. This is context — a reason to look closer — not an accusation.

## PT5 — Insider clusters

A **cluster** is **≥3 distinct insiders** making **open-market purchases** (Form 4
code **P** only — option exercises and 10b5-1 plan sales excluded) of the **same
issuer** within a rolling **30-day** window. Multiple independent insiders buying
is the most robust insider signal in the research literature; still, treat it as
one input, not a recommendation.

## PT6 — Flow views & portfolio overlap

**Flow** aggregates the last 90 days of congressional buys/sells into net buying
by sector (a heatmap) and the top net-bought / net-sold tickers, filterable by
chamber and party. Because disclosed amounts are **bands**, aggregate net flow is
weighted by the **band midpoint** — the only consistent way to sum ranges. This
midpoint is **internal weighting only**; every trade row in the app still shows
the disclosed band, never a fabricated midpoint. Built by a cron into a cache;
each view carries its `asOf`.

**Portfolio overlap** ("people you follow traded stocks you own") is computed per
user from your own follows × holdings × recent trades — all local, no market
data. It also arrives as a governed `power_overlap` insight so it flows into the
Home cards and weekly digest under the standard frequency cap.

## What we deliberately do NOT do

- No paid data (no Quiver, no 13F institutional feed) — all of the above is from
  free/public sources.
- No fabricated precision: bands stay bands; small samples say "insufficient".
- No LLM-invented numbers: the model may narrate, but every figure is computed.

Nothing here is financial advice. Disclosures are lagged and incomplete; past
excess return does not predict future return.
