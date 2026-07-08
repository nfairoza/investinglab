-- =============================================================================
-- Insights Engine — Layer 3 output: persisted structured insights.
--
-- Each row is a deterministic insight (numbers live in `slots`; the LLM only
-- narrates the words around them at read time). Status tracks the shared
-- lifecycle across all surfaces — a dismissal anywhere suppresses everywhere.
-- Per-user RLS; the service role (nightly generator) bypasses RLS.
-- =============================================================================

create table if not exists insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind         text not null,
  subject      text not null default '',        -- dedupe key part (category/card/…)
  severity     smallint not null default 1,     -- 1 | 2 | 3
  slots        jsonb not null default '{}'::jsonb,  -- every displayed number
  impact_year  numeric,                          -- $/yr framing (cross-domain ranking)
  evidence     jsonb not null default '[]'::jsonb,
  positive     boolean not null default false,   -- reinforcement insight (celebrate)
  action       jsonb,                            -- { label, deeplink } | null
  status       text not null default 'new',      -- new|seen|done|dismissed|muted
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table insights enable row level security;
create policy "ins select own" on insights for select using (auth.uid() = user_id);
create policy "ins insert own" on insights for insert with check (auth.uid() = user_id);
create policy "ins update own" on insights for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ins delete own" on insights for delete using (auth.uid() = user_id);
create index if not exists idx_insights_user_status on insights(user_id, status, created_at desc);
create index if not exists idx_insights_user_kind_subject on insights(user_id, kind, subject);
