-- =============================================================================
-- Features V2 — F6: subscription & recurring-charge detection.
--
-- Persisted output of the nightly detector over stored Plaid transactions.
-- Recompute in the cron (not per pageview). `status` lets a user dismiss a
-- false positive (marks it not-recurring, sticky). Per-user RLS; service role
-- (nightly detector) bypasses RLS.
-- =============================================================================

create table if not exists recurring_charges (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant    text not null,                 -- normalized merchant key
  cadence     text not null default 'monthly', -- 'monthly' | 'annual'
  avg_amount  numeric not null default 0,
  last_amount numeric not null default 0,
  last_seen   date,
  status      text not null default 'active', -- 'active' | 'dismissed'
  updated_at  timestamptz not null default now(),
  primary key (user_id, merchant)
);
alter table recurring_charges enable row level security;
create policy "rc select own" on recurring_charges for select using (auth.uid() = user_id);
create policy "rc insert own" on recurring_charges for insert with check (auth.uid() = user_id);
create policy "rc update own" on recurring_charges for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rc delete own" on recurring_charges for delete using (auth.uid() = user_id);
