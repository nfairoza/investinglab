-- =============================================================================
-- Per-user data + Row-Level Security for Noor Investing Lab.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- Every table below is keyed by user_id = auth.uid() and protected by RLS so a
-- user can only ever read/write their OWN rows. Even an app bug cannot return
-- another user's data — Postgres refuses.
--
-- Tokens (E*TRADE / Robinhood) live in their own rows here too; they're only
-- readable by their owner. (Encrypt-at-rest can be layered on later via pgsodium;
-- RLS already prevents cross-user access.)
-- =============================================================================

-- Helper: standard owner policies for a table. We spell them out per table for
-- clarity (Supabase has no shared policy macro).

-- ── Watchlist ────────────────────────────────────────────────────────────────
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol text not null,
  ideal_buy numeric,
  note text,
  fair_value text,
  bull_case text,
  bear_case text,
  catalyst text,
  ai_action text,
  analyzed_at timestamptz,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table watchlist enable row level security;
create policy "wl select own" on watchlist for select using (auth.uid() = user_id);
create policy "wl insert own" on watchlist for insert with check (auth.uid() = user_id);
create policy "wl update own" on watchlist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wl delete own" on watchlist for delete using (auth.uid() = user_id);

-- ── Holdings ─────────────────────────────────────────────────────────────────
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol text not null,
  shares numeric not null,
  avg_cost numeric not null default 0,
  note text,
  source text default 'manual',
  asset_type text default 'stock',
  days_gain numeric, days_gain_pct numeric,
  total_gain numeric, total_gain_pct numeric,
  market_value numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table holdings enable row level security;
create policy "hold select own" on holdings for select using (auth.uid() = user_id);
create policy "hold insert own" on holdings for insert with check (auth.uid() = user_id);
create policy "hold update own" on holdings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "hold delete own" on holdings for delete using (auth.uid() = user_id);

-- ── Journal ──────────────────────────────────────────────────────────────────
create table if not exists journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol text not null,
  side text not null,
  entry_reason text,
  target_price numeric,
  stop_loss numeric,
  exit_criteria text,
  status text default 'open',
  result_1w text,
  result_1m text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table journal enable row level security;
create policy "jr select own" on journal for select using (auth.uid() = user_id);
create policy "jr insert own" on journal for insert with check (auth.uid() = user_id);
create policy "jr update own" on journal for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jr delete own" on journal for delete using (auth.uid() = user_id);

-- ── Alerts ───────────────────────────────────────────────────────────────────
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol text not null,
  type text not null,
  direction text,
  price numeric,
  move_pct numeric,
  within_days int,
  score_op text,
  score_value numeric,
  note text,
  enabled boolean default true,
  last_triggered_at timestamptz,
  last_value numeric,
  trigger_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table alerts enable row level security;
create policy "al select own" on alerts for select using (auth.uid() = user_id);
create policy "al insert own" on alerts for insert with check (auth.uid() = user_id);
create policy "al update own" on alerts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "al delete own" on alerts for delete using (auth.uid() = user_id);

-- ── Cash (one row per user) ──────────────────────────────────────────────────
create table if not exists cash (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  amount numeric not null default 0,
  source text default 'manual',
  updated_at timestamptz default now()
);
alter table cash enable row level security;
create policy "cash select own" on cash for select using (auth.uid() = user_id);
create policy "cash insert own" on cash for insert with check (auth.uid() = user_id);
create policy "cash update own" on cash for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Broker connections / tokens (E*TRADE, Robinhood) ─────────────────────────
-- One row per user per provider. `data` holds the provider-specific token blob
-- (access/secret tokens, selected account, etc.). RLS-scoped to the owner.
create table if not exists broker_connections (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  provider text not null,            -- 'etrade' | 'robinhood'
  data jsonb not null default '{}',
  connected_at timestamptz,
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);
alter table broker_connections enable row level security;
create policy "bc select own" on broker_connections for select using (auth.uid() = user_id);
create policy "bc insert own" on broker_connections for insert with check (auth.uid() = user_id);
create policy "bc update own" on broker_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bc delete own" on broker_connections for delete using (auth.uid() = user_id);

-- ── User preferences / settings + AI cache (one row per user) ────────────────
create table if not exists user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  prefs jsonb not null default '{}',     -- ai strategy, connector keys, etc.
  ai_cache jsonb not null default '{}',  -- opportunities / alert suggestions cache
  updated_at timestamptz default now()
);
alter table user_prefs enable row level security;
create policy "up select own" on user_prefs for select using (auth.uid() = user_id);
create policy "up insert own" on user_prefs for insert with check (auth.uid() = user_id);
create policy "up update own" on user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes (RLS still applies on top).
create index if not exists idx_watchlist_user on watchlist(user_id);
create index if not exists idx_holdings_user on holdings(user_id);
create index if not exists idx_journal_user on journal(user_id);
create index if not exists idx_alerts_user on alerts(user_id);
