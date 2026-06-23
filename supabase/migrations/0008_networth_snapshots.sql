-- =============================================================================
-- Net-worth daily snapshots (per-user, RLS) — powers the net-worth trend line.
-- One row per user per day; upserted when the net-worth page is viewed.
-- =============================================================================

create table if not exists networth_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  as_of date not null default current_date,
  assets numeric not null default 0,
  debts numeric not null default 0,
  net numeric not null default 0,
  created_at timestamptz default now(),
  primary key (user_id, as_of)
);

alter table networth_snapshots enable row level security;
create policy "nws select own" on networth_snapshots for select using (auth.uid() = user_id);
create policy "nws insert own" on networth_snapshots for insert with check (auth.uid() = user_id);
create policy "nws update own" on networth_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
