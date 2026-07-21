# Deploy checklist

**Rule for every commit that adds a migration or a new env var:** the commit
message MUST include a "Deploy:" line listing the migration(s) to apply and any
new env vars to set. Otherwise a P1-style change strands the live deploy — the
code ships expecting a column/table/secret that prod doesn't have yet, and any
route that reads it fails. (This is exactly how the encrypted-token columns
broke the live dashboard: code shipped selecting `access_token_enc` before
migration 0021 was applied, and the Plaid routes rendered "Connect your
brokerage" instead of surfacing the error.)

## Before promoting `authbranch` to production

1. **Apply pending migrations** to the Supabase project, in order. Current set
   that must exist in prod:
   - `0020_app_secrets.sql` — encrypted connector/AI keys
   - `0021_plaid_token_encryption.sql` — Plaid token enc columns
   - `0022_server_cache.sql` — durable server cache
   - `0023_rate_limits.sql` — per-user rate-limit windows
   - `0024_ai_usage.sql` — AI cost-tracking log (admin dashboard card)
   - `0025_plaid_snapshot.sql` — cached Plaid balances (PA-A1, so pages don't block on live Plaid)
   - `0026_insights_ledger.sql` — Insights Engine Ledger tables (ledger_month, ledger_txn_flags)
   - `0027_insights.sql` — Insights Engine structured-insight store
   - `0028_follows_notifications.sql` — F1: follow Power Trades people + notifications inbox
   - `0029_recurring_charges.sql` — F6: detected subscriptions / recurring charges
   - `0030_insight_outcomes.sql` — Insights Engine closure loop / trust ledger
   - `0031_chat_memory.sql` — Rukmani chat memory (C5) + admin audit log (C1)
   - `0032_push_subscriptions.sql` — M1.2 web push subscriptions
   - `0033_ai_usage_feature.sql` — AIEFF4: per-feature AI cost attribution (adds `feature` label to ai_usage + backfills from `task`)
   - `0034_lookthrough_exposure.sql` — ETF-E3: per-user look-through exposure cache (nightly `lookthrough-build` job + on-holdings-change invalidation)
   - `0035_alert_deliveries.sql` — ALERTDEL: adds `alerts.critical` + `alert_deliveries` ledger (push/seen/email outcomes) for layered notification delivery + the `alert-escalate` missed-alert email cron
   - `0036_power_trade_returns.sql` — PT1: per-trade cached returns (lag + since-trade/since-disclosure move) filled by the nightly `pt-returns` cron; the Power Trades UI reads this table, never computes on pageview
   - `0037_power_track_records.sql` — PT3: per-person excess-vs-SPY track record over disclosed buys (windows 30/90/180d), filled by the nightly `pt-track-records` cron; person page + directory read this table
   - `0038_power_trade_flags.sql` — PT4: per-trade committee-jurisdiction flag (ticker sector in the member's committee jurisdiction), filled by the nightly `pt-committee-flags` cron; the "⚖ Committee overlap" chip + filter read this table
   - `0039_insider_clusters.sql` — PT5: detected insider clusters (3+ insiders buying the same issuer within 30d, Form 4 code P), filled by the nightly `insider-cluster` cron; the Clusters tab reads this table + notifies holders/watchers
   - `0040_money_v2.sql` — Money V2: `recurring_charges.next_expected` (MV1 Safe-to-Spend), `money_prefs` (buffer), `category_targets` (MV2), `goals` (MV3). The recurring cron backfills `next_expected`; Safe-to-Spend reads it live
   - MV4 live-rate grounding adds NO migration — the `rates-refresh` cron caches the FMP treasury rate in `server_cache` (24h) with its asOf; idle-cash/debt-arbitrage insights read it and degrade to generic phrasing if the FMP plan doesn't include `treasury-rates`
   - PT6 flow views + overlap add NO migration — the `pt-flow` cron caches congressional flow aggregates in `server_cache`; the overlap card + `power_overlap` insight compute at read time from local follows/holdings/trades. Flow views are `pt_flow_views`-gated (Premium; billing-off ships to all)
   - `0041_ai_usage_cache.sql` — AIOPT A2: adds `ai_usage.cached_input_tokens` so the admin cost dashboard shows the prompt-cache hit-rate (chat sends `cache_control` on its static system+tools blocks; cached input bills ~10% of base). Nullable; no backfill
   - `0042_billing.sql` — BILL: `subscriptions` (per-user, webhook-written), `billing_events` (webhook idempotency ledger), `app_config` (billing master switch + trial-reconcile flag). Card-free trial tracked in `subscriptions.trial_started_at`
   - `0043_txn_logo.sql` — adds `plaid_transactions.logo_url` (Plaid merchant logo, was dropped). The next incremental sync backfills it as transactions re-appear; merchant rows show the logo with the category icon as fallback
   - `0044_plaid_sync_usage.sql` — (Q7) `plaid_sync_usage` accounting table for the one-time historical backfill. Service-role only (RLS on, no permissive policy). Rows label the ONE-TIME `sync-backfill` Plaid pulls (pages + transactions per item) apart from recurring incremental syncs. Absent table degrades gracefully — the backfill still runs, only the accounting insert is skipped
   - `0045_budgets.sql` — (H1) `budgets` table (scope/owner_id/category/monthly_amount/status), per-user RLS on personal rows, one active budget per (owner, category) via a partial unique index. **Includes a 1:1 data migration**: existing MV2 `category_targets` rows are inserted as personal budgets, so a user's targets appear as budgets immediately on deploy. `category_targets` is intentionally NOT dropped (a later migration removes it once nothing references it). The `scope='household'` column is the forward-compat seam for Household budgets (H4), never written in this release
   - `0046_plaid_item_health.sql` — (Plaid freshness) adds `plaid_items.status` ('active'|'reauth_required'), `last_synced_at`, `error_code`, `status_changed_at`. Existing items default to 'active'; `last_synced_at` is null until the first sync stamps it. Powers the reauth banner + Reconnect (update-mode relink), the >48h stale-item amber note, and the /admin pipeline card. **New cron `plaid-sync` (hourly)** is registered in `lib/cron/jobs.ts` (dispatched by `/api/cron/tick`) — no Vercel cron change needed, the tick dispatcher covers cadence. It syncs from each item's stored cursor, refreshes stale snapshots, flips de-authed items + delivers a severity-2 nudge, and rebuilds the ledger on new activity. No new env vars
2. **Set new env vars** in Vercel (and locally in `.env.local`):
   - **Stripe (BILL)** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
     `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and the price ids
     `STRIPE_PRICE_PREMIUM_MONTHLY` / `STRIPE_PRICE_PREMIUM_YEARLY` (+ `_PRO_` when
     Pro ships). Optional `TRIAL_DAYS` (default 30). **Launch order**: (1) swap in
     LIVE keys + register the prod webhook endpoint (`/api/billing/webhook`) in the
     Stripe dashboard, (2) verify with one real $1 test purchase + refund, (3) flip
     the admin **/admin → Billing** master switch ON (runs the one-time trial
     reconcile). Enable **Stripe Tax** + **email receipts** in the dashboard — we
     build neither. The master switch is DB-backed (`app_config.billing_enabled`),
     admin-toggleable at runtime; the env `BILLING_ENABLED`/`NEXT_PUBLIC_BILLING_ENABLED`
     still force it ON when set.
   - `BILLING_ENABLED` / `NEXT_PUBLIC_BILLING_ENABLED` — (optional) env force-on for
     plan gating. ABSENT + DB switch off = billing off = every gated feature ships
     to all users (the beta default). See docs/BILLING.md.
   - `SECRETS_ENCRYPTION_KEY` — 32-byte base64 (`openssl rand -base64 32`).
     Required for P1 encryption; without it, keys/tokens fall back to plaintext.
   - `RESEND_API_KEY` — (F2) Resend key for the weekly digest email. Optional:
     without it the digest still posts an in-app notification (email is skipped).
   - `DIGEST_FROM` — (F2, optional) from-address for digest email (default
     `digest@rukmoney.com`). `NEXT_PUBLIC_APP_URL` — base URL for email links.
   - `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` — (M1.2) VAPID keypair for web
     push. Generate with `npx web-push generate-vapid-keys`. Optional
     `WEB_PUSH_SUBJECT` (default `mailto:alerts@rukmoney.com`). Without them,
     alert push is a graceful no-op (in-app + client polling still work).
   - **Plaid transaction freshness (webhook)** — set `NEXT_PUBLIC_APP_URL` to the
     public https origin (e.g. `https://rukmoney.com`); the app registers
     `${APP_URL}/api/plaid/webhook` on every item so Plaid pushes
     `SYNC_UPDATES_AVAILABLE` when new activity is ready (the async result of
     background pulls + on-demand `/transactions/refresh`). Optional
     `PLAID_WEBHOOK_URL` overrides the derived URL. Existing items get the webhook
     registered the next time Refresh is hit (or a link/relink). **Also enable
     the Transactions webhook + on-demand refresh for your app in the Plaid
     Dashboard.** Without a webhook, new transactions still arrive — just only on
     the next manual Refresh (which now POLLS Plaid) or the hourly `plaid-sync`
     cron, not the instant a purchase posts.
3. **Run one-time backfills** after the matching migration is applied:
   - `node scripts/backfill-plaid-tokens.mjs` — encrypts existing Plaid tokens
     and nulls the plaintext column (needs `SECRETS_ENCRYPTION_KEY` +
     `SUPABASE_SECRET_KEY` + `NEXT_PUBLIC_SUPABASE_URL`).
   - **(Q7) Historical backfill for EXISTING linked items** — new links backfill
     automatically (the exchange route fires `runBackfill`). For users who linked
     BEFORE this shipped, trigger the one-time full-history pull + first-insights
     build per user by POSTing `/api/plaid/backfill` as each user (or have them
     open the Insights page — the "analyzing" state resolves once a run completes).
     It's idempotent and logs its Plaid cost under the `sync-backfill` feature
     label, so re-running is safe. No script yet; drive via the authed endpoint.
4. **Verify** `npm run typecheck && npm run lint && npm run test && npm run build`
   are green (CI does this on push once `.github/workflows/ci.yml` is committed
   with a workflow-scoped token — see BACKLOG).

## Brand assets (regenerate on rebrand / copy change)

The social/OG card `app/opengraph-image.png` is a **baked static PNG**, not a
dynamic `next/og` route (static is faster for scrapers and has zero runtime
failure modes — the dynamic route also fails to prerender under `next build`).
The tradeoff: it does NOT auto-update. If the **wordmark, tagline, or the
`og-backdrop` art changes**, regenerate the card or you'll ship a stale social
preview with an out-of-date brand:

- `npm run og` — recomposites the wordmark + tagline onto the backdrop.
- `npm run art` — regenerates the underlying brand art (needs `GEMINI_API_KEY`);
  run this first if the backdrop itself changed, then `npm run og`.

Commit the regenerated `app/opengraph-image.png` (and any changed `public/art/*`)
in the same PR as the copy/brand change.

## Resilience note

The Plaid routes now degrade gracefully if the token-encryption columns aren't
migrated yet (they fall back to the plaintext column) AND surface a genuine DB
error as a 500 the UI shows — they never render the empty "connect a brokerage"
state on a query failure. Still, apply migrations promptly so encryption is
actually in effect.
