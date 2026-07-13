-- =============================================================================
-- Power Trades V2 · PT1 — Signal decay honesty.
--
-- Per-trade cached returns: the price move since the trade date and since the
-- disclosure date, plus the disclosure lag. Computed nightly by the `pt-returns`
-- cron from cached FMP daily history (never on pageview). Derived + rebuildable.
--
-- Shared public-disclosure data (not per-user): service-role only, like the
-- other power_* tables — RLS enabled with NO policies; the server reads/writes
-- via SUPABASE_SECRET_KEY. Read APIs join this onto power_trade_records.
--
-- Deploy: apply after 0035. No new env vars.
-- =============================================================================

create table if not exists power_trade_returns (
  trade_id            uuid primary key references power_trade_records(id) on delete cascade,
  ticker              text,
  lag_days            int,
  since_trade_pct     numeric,
  since_disclosure_pct numeric,
  trade_close         numeric,
  disclosure_close    numeric,
  latest_close        numeric,
  as_of               date,
  computed_at         timestamptz not null default now()
);

alter table power_trade_returns enable row level security;

create index if not exists idx_power_trade_returns_ticker on power_trade_returns (ticker);
create index if not exists idx_power_trade_returns_computed on power_trade_returns (computed_at);
