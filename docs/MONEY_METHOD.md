# Money V2 — method & honesty notes

Everything in the Money section's intent + future features is computed by
deterministic code from the user's own ledger — never by an LLM. The LLM may
narrate a number, but the number is always computed first (the Insights Engine
law). Every derived figure carries its evidence and, where cached, an `asOf`.

## Safe-to-Spend (MV1)

The daily "what can I actually spend without missing a bill" number.

```
safeToSpend = liquid balance − bills due before the next payday − buffer
```

- **Liquid balance**: sum of `current` across accounts the ledger marks
  `isLiquid` (checking + savings). Credit and investment balances don't count.
- **Bills due**: recurring obligations from the recurring detector whose
  **predicted next date** (`recurring_charges.next_expected` = last occurrence +
  detected cadence) falls **after today and on/before the next payday**. A bill
  already paid — whose `next_expected` has rolled to next cycle — drops out, so
  nothing is double-counted.
- **Next payday**: the soonest future date across the user's detected income
  streams, walked forward from the last observed deposit by the stream's cadence
  (weekly/biweekly/monthly). **Irregular-income guard**: if no stream has a
  regular cadence, we fall back to a rolling **30-day** window and label it
  ("no regular payday detected — showing 30-day view"). We never fabricate a
  payday.
- **Buffer**: user-configurable, default **$200**, editable inline on the card.

Negative Safe-to-Spend is shown honestly (never clamped to zero), in a gentle
register with one concrete next step — not a red-alarm.

Recomputed on ledger sync and on view (cheap reads); no AI. The card's evidence
expander lists the exact bills and the income assumption. Pure math +
golden tests live in `lib/money/safe-to-spend.ts` / `tests/safe-to-spend.test.ts`.

## Category targets (MV2)

Targets are **opt-in intent**, never auto-created. The app *suggests* a monthly
target from the user's own **p50 (median) of the trailing 3 months** for a
category, rounded; the user accepts, edits, or skips per category. Progress rings
show spent/target month-to-date; a pace dot marks ahead/on/behind pace for the
day of month. Pace insights phrase against the target when one exists, else the
baseline. At month end, one `target-month-result` insight per targeted category —
honest both ways (a repeated under-target gets the positive-reinforcement voice).

## Goals (MV3)

Cash-flow-only projections — **no market-return assumptions, ever**.

- Funding source = the user's overall monthly **savings flow** (from the ledger)
  or a specific account's balance growth.
- Projection: trailing **3-month funding rate** → projected completion date. The
  gap is rendered as a lever ("on pace for Nov 2027 — 3 months late; **+$180/mo**
  closes the gap"), or a positive framing when ahead.
- For a goal linked to an investment account, we project on **contributions only**
  and say so ("excludes market movement") — we never assume a return.
- A `goal-drift` insight fires on a material projection change (standard
  governor/cooldown). Method + assumptions are in each goal's evidence expander.

## Live-rate grounding (MV4)

The "money left on the table" insights cite a **dated live rate**. A short-
treasury / money-market proxy yield is fetched once per day into `server_cache`
with its `asOf`; generators read the cached rate — never per-pageview. Idle-cash
quantifies the annual cost at the current rate ("$3,200 idle at ~0% vs 4.3%
available (as of today) = $137/yr"); debt-arbitrage cites the card APR vs the
cash-rate spread. If the rate fetch fails, the insight degrades to its previous
generic phrasing — the rate never blocks the insight. Framing stays educational
(HYSA / treasury / index historical ranges) — no directives, no return promises.

Nothing here is financial advice. Figures are derived from the user's own
transaction history and are only as complete as the connected accounts.
