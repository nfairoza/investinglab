-- =============================================================================
-- Recently-viewed tickers (per user). Powers personalized AI watchlist
-- recommendations ("you might like") alongside holdings + watch lists. One row
-- per (user, symbol); viewed_at updated on each view. Per-user RLS, owner-only.
-- =============================================================================

create table if not exists public.recently_viewed (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol     text not null,
  viewed_at  timestamptz not null default now(),
  unique (user_id, symbol)
);
create index if not exists recently_viewed_user_idx on public.recently_viewed(user_id, viewed_at desc);

alter table public.recently_viewed enable row level security;
drop policy if exists recently_viewed_owner on public.recently_viewed;
create policy recently_viewed_owner on public.recently_viewed
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
