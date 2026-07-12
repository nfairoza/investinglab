-- =============================================================================
-- Mobile M1.2 — web push subscriptions. One row per browser/device push endpoint
-- the user opted into (prompted contextually on first alert creation, never on
-- load). `platform` distinguishes web (VAPID) from native ios/android (FCM/APNs,
-- M2). The alert-evaluation path sends to these when an alert triggers.
-- Per-user RLS; the service role (cron send) bypasses RLS.
-- =============================================================================

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint   text not null,                 -- push service URL (web) or device token (native)
  keys       jsonb not null default '{}'::jsonb, -- { p256dh, auth } for web push
  platform   text not null default 'web',   -- 'web' | 'ios' | 'android'
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table push_subscriptions enable row level security;
create policy "ps select own" on push_subscriptions for select using (auth.uid() = user_id);
create policy "ps insert own" on push_subscriptions for insert with check (auth.uid() = user_id);
create policy "ps update own" on push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ps delete own" on push_subscriptions for delete using (auth.uid() = user_id);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);
