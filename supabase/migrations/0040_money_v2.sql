-- =============================================================================
-- Money V2 — intent + future. MV1 Safe-to-Spend, MV2 targets, MV3 goals.
--
-- Everything here is per-user (RLS owner-only); the nightly recurring cron and
-- any cross-user job use the service role (bypasses RLS). Derived numbers are
-- computed by deterministic code — no AI writes to these tables.
--
-- Deploy: apply after 0039. No new env vars (BILLING_ENABLED optional; absent =
-- billing off = targets/goals/safe-to-spend ship to everyone).
-- =============================================================================

-- MV1 — predicted next occurrence for each recurring bill (last_seen + cadence).
-- Backfilled + kept fresh by lib/recurring/run.ts. Safe-to-Spend reads it.
alter table recurring_charges add column if not exists next_expected date;

-- MV1 — the user's Safe-to-Spend buffer (default $200), editable inline on the card.
create table if not exists money_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  safe_buffer   numeric not null default 200,
  updated_at    timestamptz not null default now()
);
alter table money_prefs enable row level security;
create policy "money_prefs select own" on money_prefs for select using (auth.uid() = user_id);
create policy "money_prefs insert own" on money_prefs for insert with check (auth.uid() = user_id);
create policy "money_prefs update own" on money_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- MV2 — opt-in category budget targets (suggested from the user's own p50, never auto-created).
create table if not exists category_targets (
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category       text not null,
  monthly_target numeric not null,
  suggested_from numeric,            -- the p50 the suggestion was based on (evidence)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, category)
);
alter table category_targets enable row level security;
create policy "category_targets select own" on category_targets for select using (auth.uid() = user_id);
create policy "category_targets insert own" on category_targets for insert with check (auth.uid() = user_id);
create policy "category_targets update own" on category_targets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "category_targets delete own" on category_targets for delete using (auth.uid() = user_id);

-- MV3 — savings goals with deterministic (cash-flow-only) projections.
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name          text not null,
  target_amount numeric not null,
  target_date   date,
  linked_kind   text not null default 'savings_flow',  -- 'savings_flow' | 'account'
  account_id    text,                                   -- set when linked_kind='account'
  status        text not null default 'active',         -- 'active' | 'achieved' | 'archived'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table goals enable row level security;
create policy "goals select own" on goals for select using (auth.uid() = user_id);
create policy "goals insert own" on goals for insert with check (auth.uid() = user_id);
create policy "goals update own" on goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals delete own" on goals for delete using (auth.uid() = user_id);
create index if not exists idx_goals_user on goals (user_id) where status = 'active';
