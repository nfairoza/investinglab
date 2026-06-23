-- =============================================================================
-- RESET + RLS HARDENING — run this in the Supabase SQL editor.
--
-- Purpose:
--   1. Wipe all per-user data so we start fresh (the old rows had no clear owner
--      and were leaking across logins).
--   2. GUARANTEE Row-Level Security is enabled on every per-user table, with
--      owner-only policies. If RLS was off, that is exactly why every user saw
--      the same generic holdings.
--   3. Make user_id NOT NULL + default auth.uid() so a row can never be created
--      without an owner.
--
-- shared_predictions is intentionally LEFT ALONE — that is the only shared table
-- (cached market/ticker research), readable by all authenticated users.
-- =============================================================================

-- ── 1. Wipe per-user data (fresh start) ──────────────────────────────────────
truncate table holdings, watchlist, journal, alerts, cash, broker_connections, user_prefs;

-- ── 2. Force RLS ON for every per-user table ─────────────────────────────────
alter table holdings            enable row level security;
alter table watchlist           enable row level security;
alter table journal             enable row level security;
alter table alerts              enable row level security;
alter table cash                enable row level security;
alter table broker_connections  enable row level security;
alter table user_prefs          enable row level security;

-- FORCE so even the table owner role is subject to RLS (extra safety).
alter table holdings            force row level security;
alter table watchlist           force row level security;
alter table journal             force row level security;
alter table alerts              force row level security;
alter table cash                force row level security;
alter table broker_connections  force row level security;
alter table user_prefs          force row level security;

-- ── 3. user_id must always be the owner ──────────────────────────────────────
-- Default to auth.uid() and NOT NULL so inserts can never be ownerless.
alter table holdings           alter column user_id set default auth.uid();
alter table watchlist          alter column user_id set default auth.uid();
alter table journal            alter column user_id set default auth.uid();
alter table alerts             alter column user_id set default auth.uid();
alter table cash               alter column user_id set default auth.uid();
alter table broker_connections alter column user_id set default auth.uid();
alter table user_prefs         alter column user_id set default auth.uid();

alter table holdings           alter column user_id set not null;
alter table watchlist          alter column user_id set not null;
alter table journal            alter column user_id set not null;
alter table alerts             alter column user_id set not null;
alter table cash               alter column user_id set not null;
alter table broker_connections alter column user_id set not null;
alter table user_prefs         alter column user_id set not null;

-- ── 4. Recreate owner-only policies (idempotent: drop then create) ───────────
-- holdings
drop policy if exists "hold select own" on holdings;
drop policy if exists "hold insert own" on holdings;
drop policy if exists "hold update own" on holdings;
drop policy if exists "hold delete own" on holdings;
create policy "hold select own" on holdings for select using (auth.uid() = user_id);
create policy "hold insert own" on holdings for insert with check (auth.uid() = user_id);
create policy "hold update own" on holdings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "hold delete own" on holdings for delete using (auth.uid() = user_id);

-- watchlist
drop policy if exists "wl select own" on watchlist;
drop policy if exists "wl insert own" on watchlist;
drop policy if exists "wl update own" on watchlist;
drop policy if exists "wl delete own" on watchlist;
create policy "wl select own" on watchlist for select using (auth.uid() = user_id);
create policy "wl insert own" on watchlist for insert with check (auth.uid() = user_id);
create policy "wl update own" on watchlist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wl delete own" on watchlist for delete using (auth.uid() = user_id);

-- journal
drop policy if exists "jr select own" on journal;
drop policy if exists "jr insert own" on journal;
drop policy if exists "jr update own" on journal;
drop policy if exists "jr delete own" on journal;
create policy "jr select own" on journal for select using (auth.uid() = user_id);
create policy "jr insert own" on journal for insert with check (auth.uid() = user_id);
create policy "jr update own" on journal for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jr delete own" on journal for delete using (auth.uid() = user_id);

-- alerts
drop policy if exists "al select own" on alerts;
drop policy if exists "al insert own" on alerts;
drop policy if exists "al update own" on alerts;
drop policy if exists "al delete own" on alerts;
create policy "al select own" on alerts for select using (auth.uid() = user_id);
create policy "al insert own" on alerts for insert with check (auth.uid() = user_id);
create policy "al update own" on alerts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "al delete own" on alerts for delete using (auth.uid() = user_id);

-- cash
drop policy if exists "cash select own" on cash;
drop policy if exists "cash insert own" on cash;
drop policy if exists "cash update own" on cash;
create policy "cash select own" on cash for select using (auth.uid() = user_id);
create policy "cash insert own" on cash for insert with check (auth.uid() = user_id);
create policy "cash update own" on cash for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- broker_connections
drop policy if exists "bc select own" on broker_connections;
drop policy if exists "bc insert own" on broker_connections;
drop policy if exists "bc update own" on broker_connections;
drop policy if exists "bc delete own" on broker_connections;
create policy "bc select own" on broker_connections for select using (auth.uid() = user_id);
create policy "bc insert own" on broker_connections for insert with check (auth.uid() = user_id);
create policy "bc update own" on broker_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bc delete own" on broker_connections for delete using (auth.uid() = user_id);

-- user_prefs
drop policy if exists "up select own" on user_prefs;
drop policy if exists "up insert own" on user_prefs;
drop policy if exists "up update own" on user_prefs;
create policy "up select own" on user_prefs for select using (auth.uid() = user_id);
create policy "up insert own" on user_prefs for insert with check (auth.uid() = user_id);
create policy "up update own" on user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 5. Verify: every per-user table must show rowsecurity = true ──────────────
-- Run this SELECT after the script; all rows should read true/true.
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relname in ('holdings','watchlist','journal','alerts','cash','broker_connections','user_prefs')
order by relname;
