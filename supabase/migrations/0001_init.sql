-- StockPilot AI — initial schema + Row Level Security
-- Run via: supabase db push   (or paste into the Supabase SQL editor)
--
-- Design notes:
--   * Every user-owned table carries user_id -> auth.users(id) and is locked
--     down with RLS so a signed-in user can only read/write their own rows.
--   * stock_snapshots is written by SERVER routes (service-role key), so it has
--     RLS enabled but NO public policy: the anon/auth client can't read or write
--     it directly. Adjust if you later want users to read their own snapshots.
--   * Money is stored as numeric (never float) to avoid rounding drift.
--   * Timestamps are timestamptz, default now().

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  base_currency text not null default 'USD',
  -- UI preference: start every report/holding in Beginner ("Explain Like I'm New") mode
  beginner_mode boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- holdings  (Section A — stocks I own)
-- ----------------------------------------------------------------------------
create table if not exists public.holdings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  symbol         text not null,
  company_name   text,
  shares         numeric(20,6) not null default 0,
  avg_cost       numeric(20,6) not null default 0,
  buy_reason     text,
  time_horizon   text,        -- e.g. 'long', '3-5y', 'trade'
  risk_tolerance text,        -- e.g. 'low' | 'medium' | 'high'
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists holdings_user_idx on public.holdings(user_id);

-- ----------------------------------------------------------------------------
-- watchlist  (Section B — stocks I might buy)
-- ----------------------------------------------------------------------------
create table if not exists public.watchlist (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text not null,
  company_name    text,
  ideal_buy_price numeric(20,6),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (user_id, symbol)
);
create index if not exists watchlist_user_idx on public.watchlist(user_id);

-- ----------------------------------------------------------------------------
-- research_reports  (Section C — generated AI memos, sections A–P)
-- ----------------------------------------------------------------------------
create table if not exists public.research_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  rating      text,             -- Buy | Buy gradually | Hold | Wait | Avoid | Sell
  confidence  int,              -- 0..100
  -- full structured memo (sections A–P, both Pro + Beginner text, scenarios, risks)
  report      jsonb not null default '{}'::jsonb,
  -- provenance so the UI can show "Data as of ..." and which provider/source
  data_as_of  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists research_user_symbol_idx
  on public.research_reports(user_id, symbol);

-- ----------------------------------------------------------------------------
-- alerts  (Section E)
-- ----------------------------------------------------------------------------
create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text,             -- nullable: portfolio-level alerts have no symbol
  -- 'price_buy_zone' | 'price_trim_zone' | 'break_support' | 'below_invalidation'
  -- | 'earnings_approaching' | 'major_news' | 'weight_too_high' | 'thesis_changed'
  kind        text not null,
  -- flexible params per kind, e.g. {"price": 150} or {"weight_pct": 25}
  params      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  last_fired_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists alerts_user_idx on public.alerts(user_id);

-- ----------------------------------------------------------------------------
-- portfolio_notes  (Section F — Portfolio Doctor findings / freeform notes)
-- ----------------------------------------------------------------------------
create table if not exists public.portfolio_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists portfolio_notes_user_idx on public.portfolio_notes(user_id);

-- ----------------------------------------------------------------------------
-- stock_snapshots  (server-written time series for per-stock charts)
-- ----------------------------------------------------------------------------
-- Written by server routes using the service-role key. No public RLS policy.
create table if not exists public.stock_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,  -- nullable: may be global
  symbol     text not null,
  price      numeric(20,6),
  -- arbitrary captured metrics: pe, fcf_yield, rsi, sma50, sma200, etc.
  metrics    jsonb not null default '{}'::jsonb,
  source     text,             -- 'live' | 'demo' | 'unavailable'
  provider   text,             -- e.g. 'financial-modeling-prep'
  captured_at timestamptz not null default now()
);
create index if not exists stock_snapshots_symbol_idx
  on public.stock_snapshots(symbol, captured_at);

-- ----------------------------------------------------------------------------
-- prediction_markets  (Section G — pinned Polymarket/Kalshi markets)
-- ----------------------------------------------------------------------------
create table if not exists public.prediction_markets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- provider's own id for the market, so refreshes can match it
  external_id     text,
  source          text,        -- 'polymarket' | 'kalshi'
  question        text not null,
  resolution_date date,
  source_url      text,
  is_pinned       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists prediction_markets_user_idx
  on public.prediction_markets(user_id);

-- ----------------------------------------------------------------------------
-- prediction_snapshots  (implied-probability-over-time series)
-- ----------------------------------------------------------------------------
create table if not exists public.prediction_snapshots (
  id           uuid primary key default gen_random_uuid(),
  market_id    uuid not null references public.prediction_markets(id) on delete cascade,
  implied_prob numeric(6,4),   -- 0..1
  volume       numeric(20,2),
  liquidity    numeric(20,2),
  captured_at  timestamptz not null default now()
);
create index if not exists prediction_snapshots_market_idx
  on public.prediction_snapshots(market_id, captured_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles             enable row level security;
alter table public.holdings             enable row level security;
alter table public.watchlist            enable row level security;
alter table public.research_reports     enable row level security;
alter table public.alerts               enable row level security;
alter table public.portfolio_notes      enable row level security;
alter table public.stock_snapshots      enable row level security;  -- server-only, no policy
alter table public.prediction_markets   enable row level security;
alter table public.prediction_snapshots enable row level security;

-- profiles: a user sees and edits only their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Generic owner policies for the user_id-scoped tables.
create policy "holdings_owner" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "watchlist_owner" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "research_reports_owner" on public.research_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "alerts_owner" on public.alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "portfolio_notes_owner" on public.portfolio_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "prediction_markets_owner" on public.prediction_markets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- prediction_snapshots: ownership is derived through the parent market row.
create policy "prediction_snapshots_owner" on public.prediction_snapshots
  for all
  using (
    exists (
      select 1 from public.prediction_markets m
      where m.id = prediction_snapshots.market_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.prediction_markets m
      where m.id = prediction_snapshots.market_id
        and m.user_id = auth.uid()
    )
  );

-- NOTE: stock_snapshots intentionally has RLS enabled and no policy, so it is
-- only reachable via the service-role key on the server. If you want users to
-- read their own snapshots from the client, add a select policy keyed on user_id.

-- ----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
