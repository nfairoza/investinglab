-- Q7: one-time historical-backfill accounting. Each row records a Plaid
-- transactions/sync pass and how many pages/transactions it pulled, labeled by
-- feature so the admin cost view can separate the ONE-TIME "sync-backfill" pulls
-- from recurring incremental syncs. Written by the service role only (the
-- backfill runs cross-user); no per-user RLS reads are needed here.

create table if not exists plaid_sync_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  item_id       text not null,
  feature       text not null default 'sync-backfill',
  env           text,
  pages         integer not null default 0,
  transactions  integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_plaid_sync_usage_feature on plaid_sync_usage (feature, created_at desc);
create index if not exists idx_plaid_sync_usage_user on plaid_sync_usage (user_id);

alter table plaid_sync_usage enable row level security;

-- Service-role only (bypasses RLS). No permissive policy → normal users can't
-- read/write it directly; it's app-internal accounting.
