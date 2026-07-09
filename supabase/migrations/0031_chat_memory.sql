-- =============================================================================
-- Rukmani chat upgrade — C5 personalization memory + admin audit (C1).
--
-- chat_memory: durable per-user facts Rukmani learns (preferences, goals,
-- expertise level, style) — injected into the system prompt each turn so answers
-- adapt. NEVER transient or sensitive attributes (enforced in the prompt + the
-- remember_fact tool). Capped ~40/user in application code.
--
-- admin_audit: written only when an admin drills into a specific user's DATA via
-- lookup_user({ include_data: true }). Keeps admin chat from becoming a silent
-- surveillance tool — every full drill-down leaves a who/what/when trail.
-- Per-user RLS; the service role bypasses as usual.
-- =============================================================================

create table if not exists chat_memory (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fact          text not null,
  kind          text not null default 'preference', -- 'preference' | 'goal' | 'profile' | 'style'
  source_msg_id text,
  updated_at    timestamptz not null default now()
);
alter table chat_memory enable row level security;
create policy "cm select own" on chat_memory for select using (auth.uid() = user_id);
create policy "cm insert own" on chat_memory for insert with check (auth.uid() = user_id);
create policy "cm update own" on chat_memory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm delete own" on chat_memory for delete using (auth.uid() = user_id);
create index if not exists idx_chat_memory_user on chat_memory(user_id, updated_at desc);

create table if not exists admin_audit (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  action     text not null,                 -- e.g. 'lookup_user.include_data'
  target     text,                          -- the email/id inspected
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table admin_audit enable row level security;
-- Only admins ever write here (enforced server-side); a user may read their own
-- actor rows. Service role sees all for a future audit view.
create policy "aa select own" on admin_audit for select using (auth.uid() = actor_id);
create policy "aa insert own" on admin_audit for insert with check (auth.uid() = actor_id);
create index if not exists idx_admin_audit_created on admin_audit(created_at desc);
