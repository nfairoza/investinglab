-- ETF look-through exposure (E3). One row per user holding the computed
-- look-through result (per-symbol + per-sector exposure fanned through ETF
-- wrappers). Recomputed nightly by the pt/lookthrough cron and on holdings change.
-- Derived + rebuildable — safe to wipe and recompute.
--
-- Deploy: apply after 0033. No new env vars (BILLING_ENABLED is optional; absent =
-- billing off = feature ships to everyone).

create table if not exists lookthrough_exposure (
  user_id       uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  by_symbol     jsonb not null default '[]'::jsonb,  -- SymbolExposure[]
  by_sector     jsonb not null default '[]'::jsonb,  -- SectorExposure[]
  total_value   numeric not null default 0,
  computed_at   timestamptz not null default now()
);

alter table lookthrough_exposure enable row level security;

-- Per-user policies (service role bypasses RLS via SUPABASE_SECRET_KEY for the
-- nightly cross-user job; clients read/write only their own row).
create policy "lookthrough select own" on lookthrough_exposure for select using (auth.uid() = user_id);
create policy "lookthrough insert own" on lookthrough_exposure for insert with check (auth.uid() = user_id);
create policy "lookthrough update own" on lookthrough_exposure for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lookthrough delete own" on lookthrough_exposure for delete using (auth.uid() = user_id);
