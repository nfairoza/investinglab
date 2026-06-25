-- =============================================================================
-- Multi-list watchlists. Replaces the single flat `watchlist` with named lists:
--   - default : the user's main list (migrated from old `watchlist`)
--   - custom  : lists the user creates
--   - followed: a saved reference to a trending screener list (preset_key);
--               items are NOT stored — the list re-runs live when opened.
--
-- Per-user, RLS owner-only (mirrors existing policy style). The old `watchlist`
-- table is LEFT IN PLACE as a rollback safety net; new code uses these tables.
-- =============================================================================

create table if not exists public.watch_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  kind        text not null default 'custom',   -- 'default' | 'custom' | 'followed'
  preset_key  text,                             -- set when kind='followed'
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists watch_lists_user_idx on public.watch_lists(user_id);
-- One followed row per (user, preset); one default per user.
create unique index if not exists watch_lists_followed_uq on public.watch_lists(user_id, preset_key) where preset_key is not null;

create table if not exists public.watch_list_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  list_id     uuid not null references public.watch_lists(id) on delete cascade,
  symbol      text not null,
  note        text,
  ideal_buy   numeric,
  fair_value  text,
  bull_case   text,
  bear_case   text,
  catalyst    text,
  ai_action   text,
  analyzed_at timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (list_id, symbol)
);
create index if not exists watch_list_items_list_idx on public.watch_list_items(list_id);
create index if not exists watch_list_items_user_idx on public.watch_list_items(user_id);

-- RLS: owner only.
alter table public.watch_lists       enable row level security;
alter table public.watch_list_items  enable row level security;

drop policy if exists watch_lists_owner on public.watch_lists;
create policy watch_lists_owner on public.watch_lists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watch_list_items_owner on public.watch_list_items;
create policy watch_list_items_owner on public.watch_list_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Migrate: give every user who has watchlist rows a 'default' list, then copy
-- their items into it. Idempotent — safe to re-run (guards on existing default).
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  new_list uuid;
begin
  for uid in (select distinct user_id from public.watchlist) loop
    -- ensure a default list exists for this user
    select id into new_list from public.watch_lists where user_id = uid and kind = 'default' limit 1;
    if new_list is null then
      insert into public.watch_lists (user_id, name, kind, sort_order)
      values (uid, 'My Watchlist', 'default', 0)
      returning id into new_list;
    end if;
    -- copy items not already present
    insert into public.watch_list_items
      (user_id, list_id, symbol, note, ideal_buy, fair_value, bull_case, bear_case, catalyst, ai_action, analyzed_at, sort_order, created_at)
    select w.user_id, new_list, w.symbol, w.note, w.ideal_buy, w.fair_value, w.bull_case, w.bear_case,
           w.catalyst, w.ai_action, w.analyzed_at, coalesce(w.sort_order, 0), coalesce(w.created_at, now())
    from public.watchlist w
    where w.user_id = uid
    on conflict (list_id, symbol) do nothing;
  end loop;
end $$;
