-- =============================================================================
-- Power Trades V2 · PT5 — Insider cluster detection (Form 4).
--
-- A cluster = 3+ distinct insiders making open-market PURCHASES (Form 4 code P)
-- of the same issuer within a rolling 30-day window. Detected nightly by the
-- `insider-cluster` cron from the synced Form-4 buys. Derived + rebuildable.
--
-- Shared public-disclosure data: service-role only (RLS on, no policies).
--
-- Deploy: apply after 0038. No new env vars.
-- =============================================================================

create table if not exists insider_clusters (
  id             uuid primary key default gen_random_uuid(),
  issuer         text not null,
  window_start   date not null,
  window_end     date not null,
  insider_count  int not null,
  insiders       jsonb not null default '[]'::jsonb,
  total_value    numeric not null default 0,
  trade_ids      jsonb not null default '[]'::jsonb,
  detected_at    timestamptz not null default now(),
  -- One current cluster row per issuer (the densest recent window). The nightly
  -- job upserts on issuer so re-runs refresh rather than duplicate.
  unique (issuer)
);

alter table insider_clusters enable row level security;

create index if not exists idx_insider_clusters_end on insider_clusters (window_end desc);
