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
2. **Set new env vars** in Vercel (and locally in `.env.local`):
   - `SECRETS_ENCRYPTION_KEY` — 32-byte base64 (`openssl rand -base64 32`).
     Required for P1 encryption; without it, keys/tokens fall back to plaintext.
3. **Run one-time backfills** after the matching migration is applied:
   - `node scripts/backfill-plaid-tokens.mjs` — encrypts existing Plaid tokens
     and nulls the plaintext column (needs `SECRETS_ENCRYPTION_KEY` +
     `SUPABASE_SECRET_KEY` + `NEXT_PUBLIC_SUPABASE_URL`).
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
