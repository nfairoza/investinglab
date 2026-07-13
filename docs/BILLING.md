# Billing & plan tiers

> **Current state: billing is OFF.** Every gated feature ships to **all users**
> until an admin turns billing on. There is no payment integration yet — this doc
> defines the tier matrix so features can be built behind the right gate now, and
> the gate goes live later with no feature rewrites.

## The master switch

`lib/billing/entitlements.ts` → `billingEnabled()` reads `BILLING_ENABLED` (or
`NEXT_PUBLIC_BILLING_ENABLED`) from the environment.

- **Unset / not `"1"` (default):** billing off. `isEntitled()` returns `true` for
  everyone, every feature. The product is fully available.
- **`"1"`:** billing on. Real plan tiers apply; gated features require the plan in
  the matrix below (admins are always entitled, for QA).

A user's plan comes from server-controlled `app_metadata.plan` on the Supabase
user (`free` | `premium` | `pro`), surfaced via `/api/me` and read client-side by
`useEntitlement(feature)`. Server routes enforce with `isEntitled(feature, plan,
isAdmin)` and return `402 { error: "upgrade_required" }` when denied.

## Tier matrix

| Feature | Key | Free | Premium | Pro |
|---|---|---|---|---|
| Core: quotes, research, holdings, watchlist, money, alerts | — | ✅ | ✅ | ✅ |
| ETF page (facts, holdings, sector/country weights, banners) | — | ✅ | ✅ | ✅ |
| **ETF look-through** (portfolio toggle + look-through insight) | `etf_lookthrough` | — | ✅ | ✅ |
| **Power Trades flow views** (sector heatmap, net-buy tables) | `pt_flow_views` | — | ✅ | ✅ |
| **Real-time insider-cluster alerts** | `pt_cluster_alerts` | — | — | ✅ |

Rationale: the *ETF page itself* is core (any symbol page shows what a fund holds).
**Look-through** — the personalized "what am I really exposed to through my ETFs"
computation — is the premium differentiator. Power Trades **flow views** are
premium; **real-time cluster alerts** are the Pro tier's timeliness upsell (Pro
ships later; the gate exists now).

## Adding a gated feature

1. Add a `Feature` key + its `FEATURE_MIN_PLAN` entry in
   `lib/billing/entitlements.ts`.
2. Add a row to the matrix above.
3. Gate the UI with `useEntitlement(key)` (hide/lock the control).
4. Enforce server-side: `if (!isEntitled(key, plan, isAdmin)) return 402`.

While billing is off, all four steps are no-ops for the user — everything shows —
but the plumbing is correct for the day the switch flips.

## Turning billing on (future)

1. Wire a payment provider to set `app_metadata.plan` on purchase/downgrade.
2. Set `BILLING_ENABLED=1` (and `NEXT_PUBLIC_BILLING_ENABLED=1` for the client).
3. That's it — every gate defined above activates. Add upgrade CTAs where
   `useEntitlement` returns false.
