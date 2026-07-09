-- =============================================================================
-- Features V2 — F1: Follow Power Trades people + a general notifications inbox.
--
-- follows: a user follows a person in the Power Trades directory; the alerts cron
-- diffs new filings against this set and creates a notification per hit.
-- notifications: general per-user inbox behind the bell icon (kind + jsonb
-- payload so future features reuse it). Push delivery lands with MOBILE_APP M1.2;
-- until then these are in-app only.
-- Per-user RLS; the service role (cron detection) bypasses RLS as usual.
-- =============================================================================

create table if not exists follows (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id   text not null,                 -- power_people.id (text for flexibility)
  person_name text not null,
  kind        text not null default 'congress', -- 'congress' | 'insider'
  created_at  timestamptz not null default now(),
  primary key (user_id, person_id)
);
alter table follows enable row level security;
create policy "fl select own" on follows for select using (auth.uid() = user_id);
create policy "fl insert own" on follows for insert with check (auth.uid() = user_id);
create policy "fl update own" on follows for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fl delete own" on follows for delete using (auth.uid() = user_id);
create index if not exists idx_follows_person on follows(person_id);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind       text not null,                  -- 'follow_filing' | 'digest' | 'recurring' | 'earnings' | ...
  payload    jsonb not null default '{}'::jsonb, -- { title, body, deeplink, dedupeKey, ... }
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
create policy "nt select own" on notifications for select using (auth.uid() = user_id);
create policy "nt insert own" on notifications for insert with check (auth.uid() = user_id);
create policy "nt update own" on notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "nt delete own" on notifications for delete using (auth.uid() = user_id);
create index if not exists idx_notifications_user_unread on notifications(user_id, read_at, created_at desc);
