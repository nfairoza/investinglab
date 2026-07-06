-- Encrypt Plaid access tokens at rest (P1.2). Adds ciphertext + iv columns; the
-- plaintext access_token column is nulled out AFTER the one-time backfill script
-- (scripts/backfill-plaid-tokens.ts) runs. New items are written encrypted.

alter table plaid_items
  add column if not exists access_token_enc text,
  add column if not exists access_token_iv  text;
