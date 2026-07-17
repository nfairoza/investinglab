-- =============================================================================
-- Plaid item-health + freshness. Adds per-item status/sync tracking so a
-- de-authed bank stops failing silently:
--   status            'active' | 'reauth_required'  (ITEM_LOGIN_REQUIRED family)
--   last_synced_at    when the item last completed a transactions/sync
--   error_code        the Plaid error_code that flipped it to reauth_required
--   status_changed_at when status last changed (drives "data paused since …")
--
-- Deploy: apply after 0045. No new env. Existing items default to 'active';
-- last_synced_at stays null until the first sync stamps it.
-- =============================================================================

alter table plaid_items add column if not exists status text not null default 'active'
  check (status in ('active', 'reauth_required'));
alter table plaid_items add column if not exists last_synced_at timestamptz;
alter table plaid_items add column if not exists error_code text;
alter table plaid_items add column if not exists status_changed_at timestamptz;
