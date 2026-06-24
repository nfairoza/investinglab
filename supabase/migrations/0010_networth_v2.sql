-- =============================================================================
-- Net Worth v2 — monthly snapshots + manual items (per-user, RLS).
-- Supersedes the daily networth_snapshots (0008); that table is left in place
-- but no longer written to.
-- =============================================================================

-- Monthly snapshot: one row per user per month. by_type holds the per-type
-- asset/liability totals for the breakdown chart.
create table if not exists net_worth_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month date not null,                       -- first day of the month
  total_assets numeric not null default 0,
  total_liabilities numeric not null default 0,
  net_worth numeric not null default 0,
  by_type jsonb not null default '{}',
  captured_at timestamptz default now(),
  primary key (user_id, month)
);
alter table net_worth_snapshots enable row level security;
create policy "nw select own" on net_worth_snapshots for select using (auth.uid() = user_id);
create policy "nw insert own" on net_worth_snapshots for insert with check (auth.uid() = user_id);
create policy "nw update own" on net_worth_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Manual assets/liabilities Plaid can't see (house, car, private loan, etc.).
create table if not exists manual_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null,                        -- 'asset' | 'liability'
  type text not null,                        -- cash|investment|retirement|real_estate|vehicle|other_asset|credit_card|mortgage|loan|other_liability
  value numeric not null default 0,          -- positive magnitude (owed for liabilities)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table manual_items enable row level security;
create policy "mi select own" on manual_items for select using (auth.uid() = user_id);
create policy "mi insert own" on manual_items for insert with check (auth.uid() = user_id);
create policy "mi update own" on manual_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mi delete own" on manual_items for delete using (auth.uid() = user_id);
create index if not exists idx_manual_items_user on manual_items(user_id);
