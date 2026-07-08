-- Plaid response snapshots (PA-A1). Live Plaid calls (balances/liabilities/
-- investments) take 1-3s each and were made on every page load, so net worth —
-- the first KPI on Overview — blocked first paint on Plaid. We now cache each
-- item's last response in Postgres and read that FIRST (tens of ms), refreshing
-- in the background when older than the freshness window.
--
-- Per-user RLS: a user reads/writes only their own snapshots. The service role
-- (background refresh) bypasses RLS as usual.

create table if not exists plaid_snapshot (
  user_id    uuid not null,
  item_id    text not null,
  kind       text not null,   -- 'balances' | 'liabilities' | 'investments'
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, item_id, kind)
);

alter table plaid_snapshot enable row level security;

create policy "own snapshots read"  on plaid_snapshot for select using (auth.uid() = user_id);
create policy "own snapshots write" on plaid_snapshot for insert with check (auth.uid() = user_id);
create policy "own snapshots update" on plaid_snapshot for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own snapshots delete" on plaid_snapshot for delete using (auth.uid() = user_id);
