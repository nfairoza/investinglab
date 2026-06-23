-- =============================================================================
-- Provider-independent transaction categorization (per-user, RLS).
--
-- Two layers of user control over categories:
--   1. plaid_merchant_rules — "merchant X → category Y" sticks for all of that
--      user's transactions from that merchant (e.g. Starbucks → Coffee).
--   2. plaid_txn_overrides — one-off per-transaction overrides (category, or
--      flags: mark as transfer / exclude from spending).
-- The provider's category is only the DEFAULT; these win.
-- =============================================================================

create table if not exists plaid_merchant_rules (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant_key text not null,            -- normalized merchant/name (lowercased)
  category text not null,
  updated_at timestamptz default now(),
  primary key (user_id, merchant_key)
);
alter table plaid_merchant_rules enable row level security;
create policy "pmr select own" on plaid_merchant_rules for select using (auth.uid() = user_id);
create policy "pmr insert own" on plaid_merchant_rules for insert with check (auth.uid() = user_id);
create policy "pmr update own" on plaid_merchant_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pmr delete own" on plaid_merchant_rules for delete using (auth.uid() = user_id);

create table if not exists plaid_txn_overrides (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  transaction_id text not null,
  category text,
  is_transfer boolean default false,
  excluded boolean default false,        -- exclude from spending totals
  updated_at timestamptz default now(),
  primary key (user_id, transaction_id)
);
alter table plaid_txn_overrides enable row level security;
create policy "pto select own" on plaid_txn_overrides for select using (auth.uid() = user_id);
create policy "pto insert own" on plaid_txn_overrides for insert with check (auth.uid() = user_id);
create policy "pto update own" on plaid_txn_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pto delete own" on plaid_txn_overrides for delete using (auth.uid() = user_id);

-- Cached transactions (Plaid sync is incremental; the cursor advances and only
-- returns NEW activity, so we persist each transaction to read history later).
create table if not exists plaid_transactions (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  transaction_id text not null,
  item_id text,
  account_id text,
  date date,
  name text,
  merchant text,
  amount numeric,
  currency text default 'USD',
  plaid_category text,                    -- provider default category
  institution text,
  pending boolean default false,
  removed boolean default false,
  primary key (user_id, transaction_id)
);
alter table plaid_transactions enable row level security;
create policy "ptx select own" on plaid_transactions for select using (auth.uid() = user_id);
create policy "ptx insert own" on plaid_transactions for insert with check (auth.uid() = user_id);
create policy "ptx update own" on plaid_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ptx delete own" on plaid_transactions for delete using (auth.uid() = user_id);
create index if not exists idx_plaid_transactions_user_date on plaid_transactions(user_id, date desc);
