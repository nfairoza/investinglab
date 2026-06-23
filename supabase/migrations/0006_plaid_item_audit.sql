-- =============================================================================
-- Plaid Item audit — monotonic, app-wide count of Items EVER created.
--
-- The Plaid Trial caps connections at 10 Items total across all users, and
-- removing an Item does NOT free the slot. So we must count Items ever created,
-- not currently-active plaid_items rows. This append-only table records one row
-- per successful exchange and is NEVER deleted on disconnect.
--
-- Only the service role reads/writes it (server-side, via SUPABASE_SECRET_KEY).
-- RLS is enabled with NO policies, so the anon/auth key can't touch it at all —
-- the service role bypasses RLS.
-- =============================================================================

create table if not exists plaid_item_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  item_id text not null,
  plaid_env text not null default 'production',
  created_at timestamptz default now()
);

alter table plaid_item_audit enable row level security;
-- Intentionally no policies: only the service role (bypasses RLS) may access it.

create index if not exists idx_plaid_item_audit_env on plaid_item_audit(plaid_env);
