-- =============================================================================
-- Power Trades V2 · PT3 — Track records.
--
-- Per-person, per-window excess-return-vs-SPY stats over their disclosed BUYs in
-- the trailing 24 months, measured from the disclosure (actionable) date.
-- Computed nightly by the `pt-track-records` cron; the person page reads this
-- table. Derived + rebuildable. See docs/PT_METHOD.md for the method.
--
-- Shared public-disclosure data: service-role only (RLS on, no policies), like
-- the other power_* tables.
--
-- Deploy: apply after 0036. No new env vars.
-- =============================================================================

create table if not exists power_track_records (
  person_id       uuid not null references power_people(id) on delete cascade,
  window_days     int not null,          -- 30 | 90 | 180
  n               int not null default 0,
  mean_excess_pct numeric,               -- null when n < 8 (insufficient history)
  median_excess_pct numeric,
  win_rate_pct    numeric,
  excesses        jsonb not null default '[]'::jsonb,  -- per-trade excess % (distribution strip)
  computed_at     timestamptz not null default now(),
  primary key (person_id, window_days)
);

alter table power_track_records enable row level security;

create index if not exists idx_power_track_records_computed on power_track_records (computed_at);
