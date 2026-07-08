-- =============================================================================
-- Insights Engine — Layer 1 (Ledger) output tables.
--
-- The Ledger normalizes a user's Plaid data into household truth: per-month
-- income/fixed/discretionary/savings rollups + per-transaction derived flags
-- (transfer / income / obligation). Both are DERIVED and rebuildable from
-- plaid_transactions by the nightly job, so they're a cache, not a source.
--
-- Kept SEPARATE from the user-owned plaid_txn_overrides (0007) so a rebuild
-- never clobbers user edits; reads merge both, with the user override winning.
-- Per-user RLS; the service role (nightly build) bypasses RLS as usual.
-- =============================================================================

create table if not exists ledger_month (
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month         text not null,            -- YYYY-MM
  income        numeric not null default 0,
  fixed         numeric not null default 0,
  discretionary numeric not null default 0,
  savings_flow  numeric not null default 0,
  by_category   jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (user_id, month)
);
alter table ledger_month enable row level security;
create policy "lm select own" on ledger_month for select using (auth.uid() = user_id);
create policy "lm insert own" on ledger_month for insert with check (auth.uid() = user_id);
create policy "lm update own" on ledger_month for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lm delete own" on ledger_month for delete using (auth.uid() = user_id);

create table if not exists ledger_txn_flags (
  user_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  transaction_id   text not null,
  is_transfer      boolean not null default false,
  transfer_pair_id text,                  -- matched opposing leg, if any
  is_income        boolean not null default false,
  obligation_kind  text,                  -- 'fixed' | 'discretionary' | null
  updated_at       timestamptz not null default now(),
  primary key (user_id, transaction_id)
);
alter table ledger_txn_flags enable row level security;
create policy "ltf select own" on ledger_txn_flags for select using (auth.uid() = user_id);
create policy "ltf insert own" on ledger_txn_flags for insert with check (auth.uid() = user_id);
create policy "ltf update own" on ledger_txn_flags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ltf delete own" on ledger_txn_flags for delete using (auth.uid() = user_id);
create index if not exists idx_ledger_txn_flags_user on ledger_txn_flags(user_id);
