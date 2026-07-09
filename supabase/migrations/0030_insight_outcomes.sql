-- =============================================================================
-- Insights Engine — stage 4: follow-through / closure loop (the trust ledger).
--
-- When a user acts on an insight (taps "I did this") or the nightly job DETECTS
-- the acted-on state from data (spending pace dropped, a balance was paid down),
-- we record an outcome: what was flagged and what was captured. The running
-- totals ("rukMoney flagged $4,120/yr of opportunities; you've captured $1,860")
-- are the app's durable trust signal.
--
-- One outcome per insight (unique insight_id). `captured_year` is the realized/
-- committed $/yr; `flagged_year` copies the insight's impactPerYear at close time
-- so the ledger totals stay stable even if the source insight later changes.
-- Per-user RLS; the service role (nightly detection) bypasses RLS.
-- =============================================================================

create table if not exists insight_outcomes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  insight_id    uuid references insights(id) on delete set null,
  kind          text not null,                 -- copied from the insight
  subject       text not null default '',
  source        text not null default 'user',  -- 'user' (tapped "I did this") | 'detected'
  flagged_year  numeric,                        -- the opportunity we flagged ($/yr)
  captured_year numeric,                         -- what was captured ($/yr)
  note          text,                            -- e.g. "Delivery down 38% since flagged"
  created_at    timestamptz not null default now(),
  unique (user_id, insight_id)
);
alter table insight_outcomes enable row level security;
create policy "io select own" on insight_outcomes for select using (auth.uid() = user_id);
create policy "io insert own" on insight_outcomes for insert with check (auth.uid() = user_id);
create policy "io update own" on insight_outcomes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "io delete own" on insight_outcomes for delete using (auth.uid() = user_id);
create index if not exists idx_insight_outcomes_user on insight_outcomes(user_id, created_at desc);
